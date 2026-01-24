import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { readJsonBodyWithLimit } from "@/lib/automation/readBody";

export const runtime = "nodejs";

function isNonEmptyString(v: unknown): v is string {
  return typeof v === "string" && v.trim().length > 0;
}

type Action = "archive" | "delete";

export async function POST(req: Request) {
  await requireAdmin();
  const supabase = await createSupabaseServerClient();
  if (!supabase) return NextResponse.json({ error: "not_configured" }, { status: 503 });

  const body = await readJsonBodyWithLimit(req);
  if (!body.ok) return NextResponse.json({ error: body.error }, { status: 400 });
  if (!body.data || typeof body.data !== "object") return NextResponse.json({ error: "invalid_body" }, { status: 400 });

  const b = body.data as Record<string, unknown>;
  const action = (isNonEmptyString(b.action) ? b.action.trim() : "") as Action;
  if (action !== "archive" && action !== "delete") {
    return NextResponse.json({ error: "invalid_action" }, { status: 400 });
  }

  const post_id = isNonEmptyString(b.post_id) ? b.post_id.trim() : "";
  const slug = isNonEmptyString(b.slug) ? b.slug.trim() : "";
  const draft_id = isNonEmptyString(b.draft_id) ? b.draft_id.trim() : "";

  let resolvedPostId = post_id;
  let resolvedSlug = slug;

  if (!resolvedPostId && !resolvedSlug && draft_id) {
    const { data: draft } = await supabase.from("ai_drafts").select("id,metadata").eq("id", draft_id).maybeSingle();
    if (draft?.metadata && typeof draft.metadata === "object") {
      const meta = draft.metadata as Record<string, unknown>;
      if (!resolvedPostId && isNonEmptyString(meta.published_post_id)) resolvedPostId = meta.published_post_id.trim();
      if (!resolvedSlug && isNonEmptyString(meta.published_slug)) resolvedSlug = meta.published_slug.trim();
    }
  }

  if (!resolvedPostId && !resolvedSlug) return NextResponse.json({ error: "post_id_or_slug_required" }, { status: 400 });

  // Resolve the row (so we can also update draft metadata if needed)
  const { data: post } = resolvedPostId
    ? await supabase.from("citizen_news_posts").select("id,slug,status").eq("id", resolvedPostId).maybeSingle()
    : await supabase.from("citizen_news_posts").select("id,slug,status").eq("slug", resolvedSlug).maybeSingle();

  if (!post) return NextResponse.json({ error: "not_found" }, { status: 404 });

  if (action === "archive") {
    const { error } = await supabase.from("citizen_news_posts").update({ status: "archived" }).eq("id", post.id);
    if (error) return NextResponse.json({ error: "db_error" }, { status: 500 });

    if (draft_id) {
      const { data: draft } = await supabase.from("ai_drafts").select("id,metadata").eq("id", draft_id).maybeSingle();
      if (draft) {
        const nextMeta =
          draft.metadata && typeof draft.metadata === "object"
            ? { ...(draft.metadata as Record<string, unknown>), archived_at: new Date().toISOString() }
            : { archived_at: new Date().toISOString() };
        await supabase.from("ai_drafts").update({ metadata: nextMeta }).eq("id", draft.id);
      }
    }

    return NextResponse.json({ ok: true, id: post.id, slug: post.slug, status: "archived" });
  }

  // delete
  const { error: delErr } = await supabase.from("citizen_news_posts").delete().eq("id", post.id);
  if (delErr) return NextResponse.json({ error: "db_error" }, { status: 500 });

  if (draft_id) {
    const { data: draft } = await supabase.from("ai_drafts").select("id,metadata").eq("id", draft_id).maybeSingle();
    if (draft) {
      const nextMeta =
        draft.metadata && typeof draft.metadata === "object"
          ? { ...(draft.metadata as Record<string, unknown>), deleted_post_at: new Date().toISOString() }
          : { deleted_post_at: new Date().toISOString() };
      await supabase.from("ai_drafts").update({ metadata: nextMeta }).eq("id", draft.id);
    }
  }

  return NextResponse.json({ ok: true, id: post.id, slug: post.slug, status: "deleted" });
}

