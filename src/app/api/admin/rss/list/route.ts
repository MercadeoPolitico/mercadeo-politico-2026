import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { fetchRssItems } from "@/lib/news/rss";

export const runtime = "nodejs";

type HealthStatus = "ok" | "warn" | "down";

function normalizeHealth(itemsCount: number, ms: number): HealthStatus {
  if (itemsCount <= 0) return "down";
  if (ms >= 3500) return "warn";
  return "ok";
}

export async function GET(req: Request) {
  await requireAdmin();
  const supabase = await createSupabaseServerClient();
  if (!supabase) return NextResponse.json({ error: "not_configured" }, { status: 503 });

  const url = new URL(req.url);
  const withHealth = url.searchParams.get("with_health") === "1" || url.searchParams.get("with_health") === "true";

  const { data, error } = await supabase
    .from("news_rss_sources")
    .select(
      "id,name,region_key,base_url,rss_url,active,updated_at,last_health_status,last_health_checked_at,last_health_http_status,last_health_ms,last_health_error,last_item_count",
    )
    .order("region_key", { ascending: true })
    .order("name", { ascending: true });

  if (error) return NextResponse.json({ error: "db_error" }, { status: 500 });

  const sources = (data ?? []) as any[];

  if (!withHealth) return NextResponse.json({ ok: true, sources });

  const nowIso = new Date().toISOString();
  const results: Array<{ id: string; status: HealthStatus; ms: number; items_count: number }> = [];

  for (const s of sources) {
    // Only auto-check active sources; keep it fast.
    if (s?.active !== true) continue;
    const started = Date.now();
    // eslint-disable-next-line no-await-in-loop
    const items = await fetchRssItems({ source: s, limit: 3 });
    const ms = Date.now() - started;
    const items_count = Array.isArray(items) ? items.length : 0;
    const status = normalizeHealth(items_count, ms);
    results.push({ id: String(s.id), status, ms, items_count });

    // Best-effort: persist snapshot (no secrets).
    // eslint-disable-next-line no-await-in-loop
    await supabase
      .from("news_rss_sources")
      .update({
        last_health_status: status,
        last_health_checked_at: nowIso,
        last_health_http_status: null,
        last_health_ms: ms,
        last_health_error: items_count > 0 ? null : "no_items_or_fetch_failed",
        last_item_count: items_count,
        updated_at: nowIso,
      })
      .eq("id", s.id);
  }

  return NextResponse.json({ ok: true, sources, health: results });
}

