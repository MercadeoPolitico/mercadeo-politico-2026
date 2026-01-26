import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth/admin";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { readJsonBodyWithLimit } from "@/lib/automation/readBody";
import { fetchRssItems } from "@/lib/news/rss";

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
  const admin = createSupabaseAdminClient();
  if (!admin) return NextResponse.json({ ok: false, error: "not_configured" }, { status: 503 });

  const body = await readJsonBodyWithLimit(req);
  if (!body.ok) return NextResponse.json({ ok: false, error: body.error }, { status: 400 });
  if (!body.data || typeof body.data !== "object") return NextResponse.json({ ok: false, error: "invalid_body" }, { status: 400 });

  const b = body.data as Record<string, unknown>;
  const name = isNonEmptyString(b.name) ? b.name.trim() : "";
  const region_key = isNonEmptyString(b.region_key) ? b.region_key.trim().toLowerCase() : "";
  const rss_url = isNonEmptyString(b.rss_url) ? b.rss_url.trim() : "";
  const active = typeof b.active === "boolean" ? b.active : true;
  const license_confirmed = typeof b.license_confirmed === "boolean" ? b.license_confirmed : false;
  const usage_policy = isNonEmptyString(b.usage_policy) ? b.usage_policy.trim().slice(0, 160) : "unknown";

  if (!name) return NextResponse.json({ ok: false, error: "name_required" }, { status: 400 });
  if (!rss_url) return NextResponse.json({ ok: false, error: "rss_url_required" }, { status: 400 });
  if (!/^https?:\/\//i.test(rss_url)) return NextResponse.json({ ok: false, error: "rss_url_invalid" }, { status: 400 });
  if (!region_key || !isRegionKey(region_key)) return NextResponse.json({ ok: false, error: "region_key_invalid" }, { status: 400 });

  const now = new Date().toISOString();
  const base_url = baseUrlFromRssUrl(rss_url);

  const { data, error } = await admin
    .from("news_rss_sources")
    .insert({
      name,
      region_key,
      rss_url,
      base_url,
      active,
      license_confirmed,
      usage_policy,
      updated_at: now,
    })
    .select("id")
    .single();

  if (error || !data?.id) return NextResponse.json({ ok: false, error: "insert_failed" }, { status: 500 });
  // Immediate health probe (real signal). Keeps UI status accurate right after creation.
  try {
    if (active) {
      const started = Date.now();
      const items = await fetchRssItems({ source: { id: data.id, name, region_key: region_key === "otra" ? "colombia" : (region_key as any), base_url, rss_url, active }, limit: 3 });
      const ms = Date.now() - started;
      const items_count = Array.isArray(items) ? items.length : 0;
      const status = items_count <= 0 ? "down" : ms >= 3500 ? "warn" : "ok";
      await admin
        .from("news_rss_sources")
        .update({
          last_health_status: status,
          last_health_checked_at: new Date().toISOString(),
          last_health_http_status: null,
          last_health_ms: ms,
          last_health_error: items_count > 0 ? null : "no_items_or_fetch_failed",
          last_item_count: items_count,
          updated_at: new Date().toISOString(),
        })
        .eq("id", data.id);
    }
  } catch {
    // ignore (best-effort)
  }
  return NextResponse.json({ ok: true, id: data.id });
}

export async function PATCH(req: Request) {
  await requireAdmin();
  const admin = createSupabaseAdminClient();
  if (!admin) return NextResponse.json({ ok: false, error: "not_configured" }, { status: 503 });

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
  if (typeof b.license_confirmed === "boolean") patch.license_confirmed = b.license_confirmed;
  if (isNonEmptyString(b.usage_policy)) patch.usage_policy = b.usage_policy.trim().slice(0, 160);
  patch.updated_at = new Date().toISOString();

  const { error } = await admin.from("news_rss_sources").update(patch).eq("id", id);
  if (error) return NextResponse.json({ ok: false, error: "update_failed" }, { status: 500 });
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: Request) {
  await requireAdmin();
  const admin = createSupabaseAdminClient();
  if (!admin) return NextResponse.json({ ok: false, error: "not_configured" }, { status: 503 });

  const body = await readJsonBodyWithLimit(req);
  if (!body.ok) return NextResponse.json({ ok: false, error: body.error }, { status: 400 });
  if (!body.data || typeof body.data !== "object") return NextResponse.json({ ok: false, error: "invalid_body" }, { status: 400 });

  const b = body.data as Record<string, unknown>;
  const id = isNonEmptyString(b.id) ? b.id.trim() : "";
  if (!id) return NextResponse.json({ ok: false, error: "id_required" }, { status: 400 });

  const { error } = await admin.from("news_rss_sources").delete().eq("id", id);
  if (error) return NextResponse.json({ ok: false, error: "delete_failed" }, { status: 500 });
  return NextResponse.json({ ok: true });
}

