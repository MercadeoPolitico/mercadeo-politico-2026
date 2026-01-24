import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

export async function GET(req: Request) {
  await requireAdmin();
  const supabase = await createSupabaseServerClient();
  if (!supabase) return NextResponse.json({ error: "not_configured" }, { status: 503 });

  const url = new URL(req.url);
  const status = (url.searchParams.get("status") ?? "").trim();

  let q = supabase
    .from("citizen_news_posts")
    .select("id,candidate_id,slug,title,media_urls,source_url,status,published_at,created_at")
    .order("published_at", { ascending: false })
    .limit(50);

  if (status === "published" || status === "archived") q = q.eq("status", status);

  const { data, error } = await q;
  if (error) return NextResponse.json({ error: "db_error" }, { status: 500 });
  return NextResponse.json({ ok: true, posts: data ?? [] });
}

