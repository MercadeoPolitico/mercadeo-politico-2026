import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { readJsonBodyWithLimit } from "@/lib/automation/readBody";
import { submitToN8n } from "@/lib/automation/n8n";

export const runtime = "nodejs";

function normalizeLineBreaks(input: string): string {
  return String(input || "")
    .replace(/\r/g, "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function isNonEmptyString(v: unknown): v is string {
  return typeof v === "string" && v.trim().length > 0;
}

export async function POST(req: Request) {
  await requireAdmin();
  const supabase = await createSupabaseServerClient();
  if (!supabase) return NextResponse.json({ error: "not_configured" }, { status: 503 });
  const sb = supabase;

  const body = await readJsonBodyWithLimit(req);
  if (!body.ok) return NextResponse.json({ error: body.error }, { status: 400 });
  if (!body.data || typeof body.data !== "object") return NextResponse.json({ error: "invalid_body" }, { status: 400 });

  const b = body.data as Record<string, unknown>;
  const post_id = isNonEmptyString(b.post_id) ? b.post_id.trim() : "";
  if (!post_id) return NextResponse.json({ error: "post_id_required" }, { status: 400 });

  const { data: post } = await sb
    .from("citizen_news_posts")
    .select("id,candidate_id,slug,title,excerpt,body,media_urls,source_url,status,published_at")
    .eq("id", post_id)
    .maybeSingle();
  if (!post) return NextResponse.json({ error: "not_found" }, { status: 404 });

  const patch: Record<string, unknown> = {};
  if (typeof b.title === "string") patch.title = normalizeLineBreaks(b.title).split("\n")[0]?.slice(0, 160) ?? post.title;
  if (typeof b.excerpt === "string") patch.excerpt = normalizeLineBreaks(b.excerpt).slice(0, 420);
  if (typeof b.body === "string") patch.body = normalizeLineBreaks(b.body);
  if (Array.isArray(b.media_urls)) patch.media_urls = b.media_urls.filter((x) => typeof x === "string" && /^https?:\/\//i.test(x)).slice(0, 4);
  if (typeof b.status === "string") patch.status = b.status;

  if (!Object.keys(patch).length) return NextResponse.json({ error: "no_changes" }, { status: 400 });

  const { error: upErr } = await sb.from("citizen_news_posts").update(patch).eq("id", post.id);
  if (upErr) return NextResponse.json({ error: "db_error" }, { status: 500 });

  // Best-effort: notify n8n for network updates (if workflow supports it).
  try {
    const { data: destinations } = await sb
      .from("politician_social_destinations")
      .select("id,network_name,network_type,profile_or_page_url,active,authorization_status")
      .eq("politician_id", (post as any).candidate_id)
      .eq("active", true)
      .eq("authorization_status", "approved");
    const approved = (destinations ?? [])
      .filter((d: any) => d && typeof d.profile_or_page_url === "string")
      .map((d: any) => ({ id: String(d.id), name: String(d.network_name), type: String(d.network_type), url: String(d.profile_or_page_url) }));

    const nextTitle = typeof patch.title === "string" ? (patch.title as string) : post.title;
    const origin = new URL(req.url).origin;
    const link = `${origin}/centro-informativo#${post.slug}`;
    const teaser = `${nextTitle}\n\nActualización editorial:\n${link}`.slice(0, 800);

    await submitToN8n({
      candidate_id: String((post as any).candidate_id),
      content_type: "social",
      generated_text: teaser,
      token_estimate: 0,
      created_at: new Date().toISOString(),
      source: "web",
      metadata: {
        origin: "admin_update_citizen_post",
        action: "update",
        post: { id: post.id, slug: post.slug, source_url: (post as any).source_url ?? null },
        destinations: approved,
      },
    });
  } catch {
    // ignore
  }

  return NextResponse.json({ ok: true });
}

