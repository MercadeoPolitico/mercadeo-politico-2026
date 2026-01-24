import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

export async function GET(req: Request) {
  await requireAdmin();
  const supabase = await createSupabaseServerClient();
  if (!supabase) return NextResponse.json({ error: "not_configured" }, { status: 503 });

  const url = new URL(req.url);
  const post_id = (url.searchParams.get("post_id") ?? "").trim();
  if (!post_id) return NextResponse.json({ error: "post_id_required" }, { status: 400 });

  const { data: post, error } = await supabase
    .from("citizen_news_posts")
    .select("id,candidate_id,slug,title,excerpt,body,media_urls,source_url,status,published_at,created_at")
    .eq("id", post_id)
    .maybeSingle();
  if (error) return NextResponse.json({ error: "db_error" }, { status: 500 });
  if (!post) return NextResponse.json({ error: "not_found" }, { status: 404 });

  return NextResponse.json({ ok: true, post });
}

