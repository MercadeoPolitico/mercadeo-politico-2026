import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { readJsonBodyWithLimit } from "@/lib/automation/readBody";

export const runtime = "nodejs";

function isNonEmptyString(v: unknown): v is string {
  return typeof v === "string" && v.trim().length > 0;
}

type RegionKey = "meta" | "colombia" | "otra";
function isRegionKey(v: string): v is RegionKey {
  return v === "meta" || v === "colombia" || v === "otra";
}

function baseUrlFromRssUrl(rss_url: string): string {
  const u = new URL(rss_url);
  return `${u.protocol}//${u.host}`;
}

export async function POST(req: Request) {
  await requireAdmin();
  const supabase = await createSupabaseServerClient();
  if (!supabase) return NextResponse.json({ ok: false, error: "not_configured" }, { status: 503 });

  const body = await readJsonBodyWithLimit(req);
  if (!body.ok) return NextResponse.json({ ok: false, error: body.error }, { status: 400 });
  if (!body.data || typeof body.data !== "object") return NextResponse.json({ ok: false, error: "invalid_body" }, { status: 400 });

  const b = body.data as Record<string, unknown>;
  const name = isNonEmptyString(b.name) ? b.name.trim() : "";
  const region_key = isNonEmptyString(b.region_key) ? b.region_key.trim().toLowerCase() : "";
  const rss_url = isNonEmptyString(b.rss_url) ? b.rss_url.trim() : "";
  const active = typeof b.active === "boolean" ? b.active : true;

  if (!name) return NextResponse.json({ ok: false, error: "name_required" }, { status: 400 });
  if (!rss_url) return NextResponse.json({ ok: false, error: "rss_url_required" }, { status: 400 });
  if (!/^https?:\/\//i.test(rss_url)) return NextResponse.json({ ok: false, error: "rss_url_invalid" }, { status: 400 });
  if (!region_key || !isRegionKey(region_key)) return NextResponse.json({ ok: false, error: "region_key_invalid" }, { status: 400 });

  const now = new Date().toISOString();
  const base_url = baseUrlFromRssUrl(rss_url);

  const { data, error } = await supabase
    .from("news_rss_sources")
    .insert({
      name,
      region_key,
      rss_url,
      base_url,
      active,
      updated_at: now,
    })
    .select("id")
    .single();

  if (error || !data?.id) return NextResponse.json({ ok: false, error: "insert_failed" }, { status: 500 });
  return NextResponse.json({ ok: true, id: data.id });
}

export async function PATCH(req: Request) {
  await requireAdmin();
  const supabase = await createSupabaseServerClient();
  if (!supabase) return NextResponse.json({ ok: false, error: "not_configured" }, { status: 503 });

  const body = await readJsonBodyWithLimit(req);
  if (!body.ok) return NextResponse.json({ ok: false, error: body.error }, { status: 400 });
  if (!body.data || typeof body.data !== "object") return NextResponse.json({ ok: false, error: "invalid_body" }, { status: 400 });

  const b = body.data as Record<string, unknown>;
  const id = isNonEmptyString(b.id) ? b.id.trim() : "";
  if (!id) return NextResponse.json({ ok: false, error: "id_required" }, { status: 400 });

  const patch: Record<string, unknown> = {};
  if (isNonEmptyString(b.name)) patch.name = b.name.trim();
  if (isNonEmptyString(b.region_key)) {
    const rk = b.region_key.trim().toLowerCase();
    if (!isRegionKey(rk)) return NextResponse.json({ ok: false, error: "region_key_invalid" }, { status: 400 });
    patch.region_key = rk;
  }
  if (isNonEmptyString(b.rss_url)) {
    const url = b.rss_url.trim();
    if (!/^https?:\/\//i.test(url)) return NextResponse.json({ ok: false, error: "rss_url_invalid" }, { status: 400 });
    patch.rss_url = url;
    patch.base_url = baseUrlFromRssUrl(url);
  }
  if (typeof b.active === "boolean") patch.active = b.active;
  patch.updated_at = new Date().toISOString();

  const { error } = await supabase.from("news_rss_sources").update(patch).eq("id", id);
  if (error) return NextResponse.json({ ok: false, error: "update_failed" }, { status: 500 });
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: Request) {
  await requireAdmin();
  const supabase = await createSupabaseServerClient();
  if (!supabase) return NextResponse.json({ ok: false, error: "not_configured" }, { status: 503 });

  const body = await readJsonBodyWithLimit(req);
  if (!body.ok) return NextResponse.json({ ok: false, error: body.error }, { status: 400 });
  if (!body.data || typeof body.data !== "object") return NextResponse.json({ ok: false, error: "invalid_body" }, { status: 400 });

  const b = body.data as Record<string, unknown>;
  const id = isNonEmptyString(b.id) ? b.id.trim() : "";
  if (!id) return NextResponse.json({ ok: false, error: "id_required" }, { status: 400 });

  const { error } = await supabase.from("news_rss_sources").delete().eq("id", id);
  if (error) return NextResponse.json({ ok: false, error: "delete_failed" }, { status: 500 });
  return NextResponse.json({ ok: true });
}

