import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { readJsonBodyWithLimit } from "@/lib/automation/readBody";
import { submitToN8n } from "@/lib/automation/n8n";

export const runtime = "nodejs";

const PLATFORM_ORDER = ["facebook", "instagram", "x", "threads", "tiktok", "youtube", "linkedin", "whatsapp", "telegram", "reddit"] as const;
type Platform = (typeof PLATFORM_ORDER)[number];

function uniqPlatforms(input: unknown): Platform[] {
  if (!Array.isArray(input)) return [];
  const set = new Set<Platform>();
  for (const v of input) {
    const s = typeof v === "string" ? v.trim().toLowerCase() : "";
    if ((PLATFORM_ORDER as readonly string[]).includes(s)) set.add(s as Platform);
  }
  return PLATFORM_ORDER.filter((p) => set.has(p));
}

function pickVariants(v: unknown): { facebook?: string; instagram?: string; x?: string } {
  if (!v || typeof v !== "object") return {};
  const o = v as Record<string, unknown>;
  const out: { facebook?: string; instagram?: string; x?: string } = {};
  if (typeof o.facebook === "string" && o.facebook.trim()) out.facebook = o.facebook.trim();
  if (typeof o.instagram === "string" && o.instagram.trim()) out.instagram = o.instagram.trim();
  if (typeof o.x === "string" && o.x.trim()) out.x = o.x.trim();
  return out;
}

function shorten(s: string, max: number): string {
  const t = s.trim();
  if (t.length <= max) return t;
  return `${t.slice(0, Math.max(0, max - 1)).trimEnd()}…`;
}

function mediaFromDraftMetadata(meta: unknown): string[] {
  if (!meta || typeof meta !== "object") return [];
  const m = meta as Record<string, unknown>;
  // editorial-orchestrate stores admin_inputs.recent_media_urls
  const adminInputs = m.admin_inputs;
  if (adminInputs && typeof adminInputs === "object") {
    const urls = (adminInputs as any).recent_media_urls;
    if (Array.isArray(urls)) return urls.filter((u: unknown) => typeof u === "string" && u.startsWith("http")).slice(0, 4);
  }
  return [];
}

export async function POST(req: Request) {
  await requireAdmin();
  const supabase = await createSupabaseServerClient();
  if (!supabase) return NextResponse.json({ error: "supabase_not_configured" }, { status: 503 });

  const body = await readJsonBodyWithLimit(req);
  if (!body.ok) return NextResponse.json({ error: body.error }, { status: 400 });
  if (!body.data || typeof body.data !== "object") return NextResponse.json({ error: "invalid_body" }, { status: 400 });

  const b = body.data as Record<string, unknown>;
  const draft_id = typeof b.draft_id === "string" ? b.draft_id.trim() : "";
  const platforms = uniqPlatforms(b.platforms);
  const immediate = b.immediate === true; // if true: send to n8n now

  if (!draft_id) return NextResponse.json({ error: "draft_id_required" }, { status: 400 });
  if (!platforms.length) return NextResponse.json({ error: "platforms_required" }, { status: 400 });

  const { data: draft } = await supabase
    .from("ai_drafts")
    .select("id,candidate_id,content_type,topic,generated_text,variants,metadata,status,created_at")
    .eq("id", draft_id)
    .maybeSingle();

  if (!draft) return NextResponse.json({ error: "draft_not_found" }, { status: 404 });
  if (draft.status !== "approved" && draft.status !== "edited") return NextResponse.json({ error: "draft_not_approved" }, { status: 400 });

  const baseText = String(draft.generated_text || "").trim();
  if (!baseText) return NextResponse.json({ error: "draft_empty" }, { status: 400 });

  const vv = pickVariants(draft.variants);
  const media_urls = mediaFromDraftMetadata(draft.metadata);
  const now = new Date().toISOString();

  // Build per-platform content (safe defaults).
  const perPlatform = (p: Platform): string => {
    if (p === "facebook") return vv.facebook ?? shorten(baseText, 900);
    if (p === "instagram") return vv.instagram ?? shorten(baseText, 900);
    if (p === "x") return vv.x ?? shorten(baseText, 280);
    if (p === "threads") return vv.instagram ?? shorten(baseText, 900);
    if (p === "linkedin") return vv.facebook ?? shorten(baseText, 1300);
    if (p === "whatsapp") return shorten(baseText, 900);
    if (p === "telegram") return shorten(baseText, 1500);
    if (p === "reddit") return shorten(baseText, 2500);
    // tiktok/youtube: treat as caption + link references
    return shorten(baseText, 1000);
  };

  const created: Array<{ platform: Platform; publication_id: string; sent_to_n8n: boolean; error?: string }> = [];

  for (const platform of platforms) {
    // eslint-disable-next-line no-await-in-loop
    const { data: inserted, error } = await supabase
      .from("politician_publications")
      .insert({
        politician_id: draft.candidate_id,
        platform,
        title: typeof draft.topic === "string" && draft.topic.trim() ? draft.topic.trim().slice(0, 140) : null,
        content: perPlatform(platform),
        variants: draft.variants ?? {},
        media_urls: media_urls.length ? media_urls : null,
        status: "approved", // admin-gated
        rotation_window_days: null,
        expires_at: null,
        updated_at: now,
      })
      .select("id")
      .single();

    if (error || !inserted?.id) {
      created.push({ platform, publication_id: "", sent_to_n8n: false, error: "insert_failed" });
      // eslint-disable-next-line no-continue
      continue;
    }

    let sent = false;
    let err: string | undefined;

    if (immediate) {
      // eslint-disable-next-line no-await-in-loop
      const result = await submitToN8n({
        candidate_id: draft.candidate_id,
        content_type: "social",
        generated_text: perPlatform(platform),
        token_estimate: 0,
        created_at: now,
        source: "web",
        metadata: {
          origin: "admin_publish_from_draft",
          draft_id: draft.id,
          publication_id: inserted.id,
          platform,
          variants: draft.variants ?? {},
          media_urls,
        },
      });

      if (result.ok) {
        sent = true;
        // eslint-disable-next-line no-await-in-loop
        await supabase.from("politician_publications").update({ status: "sent_to_n8n", updated_at: now }).eq("id", inserted.id);
      } else {
        err = result.error;
      }
    }

    created.push({ platform, publication_id: inserted.id, sent_to_n8n: sent, ...(err ? { error: err } : {}) });
  }

  return NextResponse.json({ ok: true, created, immediate });
}

