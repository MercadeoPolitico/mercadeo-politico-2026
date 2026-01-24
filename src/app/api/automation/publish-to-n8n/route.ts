import { NextResponse } from "next/server";
import { readJsonBodyWithLimit } from "@/lib/automation/readBody";
import { submitToN8n } from "@/lib/automation/n8n";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { ensureSocialVariants } from "@/lib/automation/socialVariants";
import { isAdminSession } from "@/lib/auth/adminSession";

export const runtime = "nodejs";

function isBrowserOrigin(req: Request): boolean {
  return Boolean(
    req.headers.get("sec-fetch-site") ||
      req.headers.get("sec-ch-ua") ||
      req.headers.get("sec-ch-ua-mobile") ||
      req.headers.get("sec-ch-ua-platform"),
  );
}

function normalizeToken(v: unknown): string {
  const s = String(v ?? "").trim();
  if (!s) return "";
  if ((s.startsWith('"') && s.endsWith('"')) || (s.startsWith("'") && s.endsWith("'"))) return s.slice(1, -1).trim();
  return s.endsWith("\\n") ? s.slice(0, -2).trim() : s;
}

function allow(req: Request): boolean {
  const apiToken = process.env.MP26_AUTOMATION_TOKEN ?? process.env.AUTOMATION_API_TOKEN;
  const headerToken = req.headers.get("x-automation-token") ?? "";
  if (!apiToken) return false;
  return normalizeToken(headerToken) === normalizeToken(apiToken);
}

function titleFromText(text: string): string {
  const lines = String(text || "").split("\n").map((l) => l.trim());
  return (lines.find((l) => l.length > 0) ?? "").slice(0, 160);
}

function hostOf(u: string): string | null {
  try {
    return new URL(u).host;
  } catch {
    return null;
  }
}

type NetworkKey = "facebook" | "instagram" | "threads" | "x" | "telegram" | "reddit";
type DestinationScope = "page" | "profile" | "channel";

function normalizeNetworkKeyFrom(name: unknown, url: unknown): NetworkKey | null {
  const hay = `${String(name ?? "")} ${String(url ?? "")}`.toLowerCase();
  if (hay.includes("facebook") || hay.includes("fb.com") || hay.includes("facebook.com")) return "facebook";
  if (hay.includes("instagram") || hay.includes("instagr.am") || hay.includes("instagram.com")) return "instagram";
  if (hay.includes("threads") || hay.includes("threads.net")) return "threads";
  if (hay.includes("twitter") || hay.includes("x.com") || hay.includes("t.co")) return "x";
  if (hay.includes("telegram") || hay.includes("t.me")) return "telegram";
  if (hay.includes("reddit") || hay.includes("reddit.com")) return "reddit";
  return null;
}

function normalizeScopeFrom(v: unknown, nk: NetworkKey | null): DestinationScope {
  const s = String(v ?? "").trim().toLowerCase();
  if (s === "page" || s === "profile" || s === "channel") return s;
  if (nk === "telegram") return "channel";
  if (nk === "facebook") return "page";
  return "profile";
}

function defaultCredentialRefFor(nk: NetworkKey | null): string {
  if (!nk) return "default";
  if (nk === "facebook" || nk === "instagram" || nk === "threads") return "meta_default";
  if (nk === "x") return "x_default";
  if (nk === "telegram") return "telegram_default";
  if (nk === "reddit") return "reddit_default";
  return "default";
}

function regionKeyFromCandidate(candidate: any | null): "meta" | "colombia" {
  const office = String(candidate?.office ?? "").toLowerCase();
  if (office.includes("senado")) return "colombia";
  const region = String(candidate?.region ?? "").toLowerCase();
  if (region.includes("meta")) return "meta";
  return "colombia";
}

export async function POST(req: Request) {
  // Primary contract: server-to-server with x-automation-token.
  // Admin UX contract: allow admin session (cookies) to call this endpoint too.
  const okToken = allow(req);
  const okAdmin = !okToken && isBrowserOrigin(req) ? await isAdminSession() : false;
  if (!okToken && !okAdmin) {
    if (isBrowserOrigin(req)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const admin = createSupabaseAdminClient();
  if (!admin) return NextResponse.json({ error: "supabase_not_configured" }, { status: 503 });

  const body = await readJsonBodyWithLimit(req);
  if (!body.ok) return NextResponse.json({ error: body.error }, { status: 400 });
  if (!body.data || typeof body.data !== "object") return NextResponse.json({ error: "invalid_body" }, { status: 400 });
  const b = body.data as Record<string, unknown>;
  const draft_id = typeof b.draft_id === "string" ? b.draft_id.trim() : "";
  const allow_no_image = b.allow_no_image === true;
  if (!draft_id) return NextResponse.json({ error: "draft_id_required" }, { status: 400 });

  const { data: draft } = await admin
    .from("ai_drafts")
    .select("id,candidate_id,content_type,generated_text,variants,metadata,status,created_at")
    .eq("id", draft_id)
    .maybeSingle();
  if (!draft) return NextResponse.json({ error: "draft_not_found" }, { status: 404 });
  if (draft.status !== "approved" && draft.status !== "edited") return NextResponse.json({ error: "draft_not_approved" }, { status: 400 });

  const { data: destinations } = await admin
    .from("politician_social_destinations")
    .select("id,politician_id,network_name,network_key,scope,target_id,credential_ref,network_type,profile_or_page_url,active,authorization_status")
    .eq("politician_id", draft.candidate_id)
    .eq("active", true)
    .eq("authorization_status", "approved");

  const approved = (destinations ?? []).filter((d: any) => d && typeof d.profile_or_page_url === "string");
  if (!approved.length) {
    return NextResponse.json({ ok: false, error: "no_approved_networks" }, { status: 409 });
  }

  const now = new Date().toISOString();
  const baseText = String(draft.generated_text || "").trim();
  if (!baseText) return NextResponse.json({ ok: false, error: "draft_empty" }, { status: 400 });

  // Publish constraints (server-side safety)
  const title = titleFromText(baseText);
  if (!title) return NextResponse.json({ ok: false, error: "missing_title" }, { status: 400 });
  const meta = (draft.metadata as any) ?? {};
  const sourceName = typeof meta.source_name === "string" ? meta.source_name.trim() : "";
  const sourceUrl = typeof meta.source_url === "string" ? meta.source_url.trim() : "";
  const derivedSource = !sourceName && sourceUrl ? hostOf(sourceUrl) ?? "" : sourceName;
  if (!derivedSource) return NextResponse.json({ ok: false, error: "missing_author" }, { status: 400 });

  const mediaUrl = meta?.media?.image_url && typeof meta.media.image_url === "string" ? meta.media.image_url.trim() : "";
  const allowNoImage = allow_no_image || meta.allow_no_image === true;
  if (!allowNoImage && !mediaUrl) return NextResponse.json({ ok: false, error: "missing_image" }, { status: 400 });

  const { data: candidate } = await admin
    .from("politicians")
    .select("id,name,office,region,ballot_number")
    .eq("id", draft.candidate_id)
    .maybeSingle();

  const region_key = regionKeyFromCandidate(candidate);

  const payload = {
    candidate_id: draft.candidate_id,
    content_type: "social" as const,
    generated_text: baseText,
    token_estimate: 0,
    created_at: now,
    source: "web" as const,
    variants: ensureSocialVariants({
      baseText,
      blogText: typeof (draft.variants as any)?.blog === "string" ? String((draft.variants as any).blog) : null,
      variants: (draft.variants as any) ?? null,
      seo_keywords: (draft.metadata as any)?.seo_keywords ?? [],
      candidate: candidate ? { name: candidate.name, ballot_number: candidate.ballot_number ?? null } : null,
    }),
    draft: {
      id: draft.id,
      candidate_id: draft.candidate_id,
      generated_text: baseText,
      variants: ensureSocialVariants({
        baseText,
        blogText: typeof (draft.variants as any)?.blog === "string" ? String((draft.variants as any).blog) : null,
        variants: (draft.variants as any) ?? null,
        seo_keywords: (draft.metadata as any)?.seo_keywords ?? [],
        candidate: candidate ? { name: candidate.name, ballot_number: candidate.ballot_number ?? null } : null,
      }),
    },
    metadata: {
      origin: "admin_publish_to_approved_networks",
      draft_id: draft.id,
      title,
      author: derivedSource,
      candidate: candidate
        ? { id: candidate.id, name: candidate.name, office: candidate.office, region: candidate.region, ballot_number: candidate.ballot_number ?? null }
        : { id: draft.candidate_id },
      // Canonical routing contract for n8n (plus backward-compatible fields)
      destinations: approved.map((d: any) => {
        const nk = (typeof d.network_key === "string" && d.network_key.trim() ? d.network_key.trim().toLowerCase() : "") as any;
        const network = (nk || normalizeNetworkKeyFrom(d.network_name, d.profile_or_page_url) || "facebook") as NetworkKey;
        const scope = normalizeScopeFrom(d.scope, network);
        const cred = typeof d.credential_ref === "string" && d.credential_ref.trim() ? d.credential_ref.trim() : defaultCredentialRefFor(network);
        const target_id = typeof d.target_id === "string" ? d.target_id.trim() : "";
        const base = {
          network,
          scope,
          credential_ref: cred,
          candidate_id: draft.candidate_id,
          region: region_key,
        } as any;
        if (scope === "page") base.page_id = target_id || null;
        if (scope === "profile") base.account_id = target_id || null;
        if (scope === "channel") base.channel_id = target_id || null;
        // Extra fields for traceability
        base.destination_id = d.id;
        base.network_name = d.network_name;
        base.network_type = d.network_type;
        base.profile_or_page_url = d.profile_or_page_url;
        return base;
      }),
      media: mediaUrl ? { ...(meta.media ?? {}), image_url: mediaUrl } : null,
      source_url: sourceUrl || null,
      allow_no_image: allowNoImage,
    },
  };

  const result = await submitToN8n(payload);
  if (!result.ok) {
    await admin
      .from("ai_drafts")
      .update({
        metadata: { ...(draft.metadata as any), n8n_publish: { status: "failed", error: result.error, attempted_at: now } },
        updated_at: now,
      })
      .eq("id", draft.id);
    const status = result.error === "disabled" || result.error === "not_configured" ? 503 : 502;
    return NextResponse.json({ ok: false, error: result.error }, { status });
  }

  await admin
    .from("ai_drafts")
    .update({
      status: "sent_to_n8n",
      metadata: { ...(draft.metadata as any), n8n_publish: { status: "sent", sent_at: now, destinations_count: approved.length } },
      updated_at: now,
    })
    .eq("id", draft.id);

  return NextResponse.json({ ok: true, sent: true, destinations_count: approved.length });
}

