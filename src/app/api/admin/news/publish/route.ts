import { NextResponse } from "next/server";
import { requireAdminApi } from "@/lib/auth/adminApi";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { readJsonBodyWithLimit } from "@/lib/automation/readBody";

export const runtime = "nodejs";

function isNonEmptyString(v: unknown): v is string {
  return typeof v === "string" && v.trim().length > 0;
}

function normalizeDraftStatus(v: unknown): string {
  return String(v ?? "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function isApprovedDraftStatus(v: unknown): boolean {
  const s = normalizeDraftStatus(v);
  return s === "approved" || s === "edited";
}

function normalizeLineBreaks(input: string): string {
  return String(input || "")
    .replace(/\r/g, "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function slugify(input: string): string {
  const base = input
    .toLowerCase()
    .normalize("NFKD")
    .replaceAll(/[\u0300-\u036f]/g, "")
    .replaceAll(/[^a-z0-9]+/g, "-")
    .replaceAll(/^-+|-+$/g, "");
  return base.length ? base.slice(0, 64) : `post-${Date.now()}`;
}

function imageUrlFromDraftMeta(meta: unknown): string | null {
  if (!meta || typeof meta !== "object") return null;
  const m = meta as Record<string, unknown>;
  const media = m.media && typeof m.media === "object" ? (m.media as Record<string, unknown>) : null;
  const candidates = [
    media && typeof media.image_url === "string" ? media.image_url : null,
    typeof m.image_url === "string" ? m.image_url : null,
    m.image_metadata && typeof m.image_metadata === "object" && typeof (m.image_metadata as any).url === "string" ? (m.image_metadata as any).url : null,
  ]
    .filter((x): x is string => typeof x === "string")
    .map((s) => s.trim())
    .filter(Boolean);
  const url = candidates[0] ?? "";
  return url && /^https?:\/\//i.test(url) ? url : null;
}

export async function POST(req: Request) {
  const auth = await requireAdminApi();
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  // Use service-role for admin publishing to avoid RLS surprises.
  const admin = createSupabaseAdminClient();
  if (!admin) return NextResponse.json({ error: "not_configured" }, { status: 503 });

  const body = await readJsonBodyWithLimit(req);
  if (!body.ok) return NextResponse.json({ error: body.error }, { status: 400 });
  if (!body.data || typeof body.data !== "object") return NextResponse.json({ error: "invalid_body" }, { status: 400 });

  const b = body.data as Record<string, unknown>;
  const draft_id = isNonEmptyString(b.draft_id) ? b.draft_id.trim() : "";
  const allow_no_image = b.allow_no_image === true;
  if (!draft_id) return NextResponse.json({ error: "draft_id_required" }, { status: 400 });

  const { data: draft } = await admin
    .from("ai_drafts")
    .select("id,candidate_id,content_type,generated_text,subtitle,metadata,status,created_at")
    .eq("id", draft_id)
    .maybeSingle();

  if (!draft) return NextResponse.json({ error: "not_found" }, { status: 404 });
  if (draft.content_type !== "blog") return NextResponse.json({ error: "not_a_blog" }, { status: 400 });
  if (!isApprovedDraftStatus(draft.status)) return NextResponse.json({ error: "not_approved" }, { status: 400 });

  // Idempotency: if draft already references a published post, return it.
  const draftMeta = (draft.metadata ?? null) as any;
  const existingPostId = typeof draftMeta?.published_post_id === "string" ? String(draftMeta.published_post_id).trim() : "";
  const existingSlug = typeof draftMeta?.published_slug === "string" ? String(draftMeta.published_slug).trim() : "";
  if (existingPostId) {
    const { data: existing } = await admin.from("citizen_news_posts").select("id,slug,status").eq("id", existingPostId).maybeSingle();
    if (existing?.id && typeof (existing as any).slug === "string") {
      return NextResponse.json({ ok: true, slug: String((existing as any).slug), already_published: true });
    }
  }
  if (existingSlug) {
    const { data: existing } = await admin.from("citizen_news_posts").select("id,slug,status").eq("slug", existingSlug).maybeSingle();
    if (existing?.id && typeof (existing as any).slug === "string") {
      return NextResponse.json({ ok: true, slug: String((existing as any).slug), already_published: true });
    }
  }

  const normalizedBody = normalizeLineBreaks(String(draft.generated_text || ""));
  const lines = normalizedBody.split("\n").map((l) => l.trim());
  const title = lines.find((l) => l.length > 0)?.slice(0, 160) || "Centro informativo ciudadano";
  const excerpt = lines.filter(Boolean).slice(0, 6).join("\n").slice(0, 420);
  const slug = slugify(`${draft.candidate_id}-${draft.created_at}-${title}`);
  const subtitle = typeof (draft as any).subtitle === "string" ? String((draft as any).subtitle).trim() : "";

  const source_url =
    draft.metadata && typeof draft.metadata === "object" && "source_url" in (draft.metadata as Record<string, unknown>)
      ? (draft.metadata as Record<string, unknown>).source_url
      : null;

  const source_name =
    draft.metadata && typeof draft.metadata === "object" && "source_name" in (draft.metadata as Record<string, unknown>)
      ? (draft.metadata as Record<string, unknown>).source_name
      : null;

  const derivedAuthor = (() => {
    if (typeof source_name === "string" && source_name.trim()) return source_name.trim();
    if (typeof source_url === "string" && source_url.trim()) {
      try {
        return new URL(source_url.trim()).host;
      } catch {
        return null;
      }
    }
    return null;
  })();

  const media_url = imageUrlFromDraftMeta(draft.metadata);

  // Safety checks (avoid publishing incomplete posts)
  if (!title.trim()) return NextResponse.json({ error: "missing_title" }, { status: 400 });
  if (!derivedAuthor) return NextResponse.json({ error: "missing_author" }, { status: 400 });
  const allowNoImage = allow_no_image || (draft.metadata && typeof draft.metadata === "object" && (draft.metadata as any).allow_no_image === true);
  if (!allowNoImage && !media_url) return NextResponse.json({ error: "missing_image" }, { status: 400 });

  const { data: inserted, error: insErr } = await admin
    .from("citizen_news_posts")
    .insert({
      candidate_id: draft.candidate_id,
      slug,
      title,
      subtitle: subtitle || null,
      excerpt,
      body: normalizedBody,
      media_urls: media_url ? [media_url] : null,
      source_url: typeof source_url === "string" ? source_url : null,
      status: "published",
      published_at: new Date().toISOString(),
    })
    .select("id")
    .maybeSingle();

  if (insErr) {
    // If the slug already exists (retry/replay), treat as ok and return the existing record.
    const { data: existing } = await admin.from("citizen_news_posts").select("id,slug").eq("slug", slug).maybeSingle();
    if (existing?.id && typeof (existing as any).slug === "string") {
      // Store backlink in draft metadata (non-destructive).
      const nextMeta =
        draft.metadata && typeof draft.metadata === "object"
          ? { ...(draft.metadata as Record<string, unknown>), published_post_id: existing.id ?? null, published_slug: String((existing as any).slug) }
          : { published_post_id: existing.id ?? null, published_slug: String((existing as any).slug) };
      await admin.from("ai_drafts").update({ metadata: nextMeta }).eq("id", draft.id);
      return NextResponse.json({ ok: true, slug: String((existing as any).slug), already_published: true });
    }
    return NextResponse.json({ error: "insert_failed" }, { status: 400 });
  }

  // Store backlink in draft metadata (non-destructive).
  const nextMeta =
    draft.metadata && typeof draft.metadata === "object"
      ? { ...(draft.metadata as Record<string, unknown>), published_post_id: inserted?.id ?? null, published_slug: slug }
      : { published_post_id: inserted?.id ?? null, published_slug: slug };

  await admin.from("ai_drafts").update({ metadata: nextMeta }).eq("id", draft.id);

  return NextResponse.json({ ok: true, slug });
}

