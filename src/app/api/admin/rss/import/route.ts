import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth/admin";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { readJsonBodyWithLimit } from "@/lib/automation/readBody";
import { fetchRssItems } from "@/lib/news/rss";

export const runtime = "nodejs";

type RegionKey = "meta" | "colombia" | "otra";

function isNonEmptyString(v: unknown): v is string {
  return typeof v === "string" && v.trim().length > 0;
}

function normalizeName(s: string): string {
  return String(s || "").replace(/\s+/g, " ").trim().slice(0, 80);
}

function baseUrlFromRssUrl(rss_url: string): string {
  const u = new URL(rss_url);
  return `${u.protocol}//${u.host}`;
}

function regionHintFromLine(line: string): RegionKey | null {
  const t = String(line || "").toLowerCase();
  if (t.includes("noticias del meta") || t.includes("meta / villavicencio") || t.includes("villavicencio") || t.includes("meta (")) return "meta";
  if (t.includes("noticias de colombia") || t.includes("nacional") || t.includes("colombia")) return "colombia";
  return null;
}

function looksGovDomain(rssUrl: string): boolean {
  try {
    const host = new URL(rssUrl).host.toLowerCase();
    return host.endsWith(".gov.co") || host.endsWith(".gov");
  } catch {
    return false;
  }
}

export async function POST(req: Request) {
  await requireAdmin();
  const admin = createSupabaseAdminClient();
  if (!admin) return NextResponse.json({ ok: false, error: "not_configured" }, { status: 503 });

  const body = await readJsonBodyWithLimit(req);
  if (!body.ok) return NextResponse.json({ ok: false, error: body.error }, { status: 400 });
  if (!body.data || typeof body.data !== "object") return NextResponse.json({ ok: false, error: "invalid_body" }, { status: 400 });

  const b = body.data as Record<string, unknown>;
  const text = isNonEmptyString(b.text) ? b.text : "";
  const default_region = (isNonEmptyString(b.default_region) ? b.default_region.trim().toLowerCase() : "colombia") as RegionKey;
  const active = typeof b.active === "boolean" ? b.active : true;

  const defaultRegion: RegionKey = default_region === "meta" || default_region === "otra" ? default_region : "colombia";

  if (!text.trim()) return NextResponse.json({ ok: false, error: "text_required" }, { status: 400 });

  const lines = text.split(/\r?\n/g).map((l) => String(l || "").trim());
  let currentRegion: RegionKey = defaultRegion;

  const candidates: Array<{ name: string; rss_url: string; region_key: RegionKey }> = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i] ?? "";
    if (!line) continue;

    const rk = regionHintFromLine(line);
    if (rk) {
      currentRegion = rk;
      continue;
    }

    const m = line.match(/https?:\/\/\S+/i);
    if (!m?.[0]) continue;
    const rss_url = m[0].replace(/[)\],.]+$/g, "").trim();
    if (!/^https?:\/\//i.test(rss_url)) continue;

    const prev = (lines[i - 1] ?? "").trim();
    const name = normalizeName(prev && !/https?:\/\//i.test(prev) ? prev : new URL(rss_url).host);

    candidates.push({ name, rss_url, region_key: currentRegion });
  }

  if (!candidates.length) return NextResponse.json({ ok: false, error: "no_urls_found" }, { status: 400 });

  // De-dupe by URL
  const byUrl = new Map<string, { name: string; rss_url: string; region_key: RegionKey }>();
  for (const c of candidates) {
    byUrl.set(c.rss_url, c);
  }
  const uniq = Array.from(byUrl.values());

  // Fetch existing to avoid duplicates.
  const { data: existing } = await admin.from("news_rss_sources").select("rss_url").in("rss_url", uniq.map((u) => u.rss_url));
  const existingSet = new Set((existing ?? []).map((r: any) => String(r?.rss_url ?? "").trim()).filter(Boolean));

  const now = new Date().toISOString();
  const toInsert = uniq
    .filter((c) => !existingSet.has(c.rss_url))
    .map((c) => {
      const usage_policy = looksGovDomain(c.rss_url) ? "open_government" : "unknown";
      const license_confirmed = looksGovDomain(c.rss_url);
      return {
        name: c.name,
        region_key: c.region_key,
        rss_url: c.rss_url,
        base_url: baseUrlFromRssUrl(c.rss_url),
        active,
        license_confirmed,
        usage_policy,
        updated_at: now,
      };
    });

  let inserted = 0;
  if (toInsert.length) {
    const { error } = await admin.from("news_rss_sources").insert(toInsert);
    if (error) return NextResponse.json({ ok: false, error: "insert_failed" }, { status: 500 });
    inserted = toInsert.length;
  }

  // Best-effort: probe a few (fast) so the signal appears immediately.
  try {
    const probe = toInsert.slice(0, 6);
    for (const s of probe) {
      if (!s.active) continue;
      const started = Date.now();
      // eslint-disable-next-line no-await-in-loop
      const items = await fetchRssItems({ source: s as any, limit: 3 });
      const ms = Date.now() - started;
      const items_count = Array.isArray(items) ? items.length : 0;
      const status = items_count <= 0 ? "down" : ms >= 3500 ? "warn" : "ok";
      // eslint-disable-next-line no-await-in-loop
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
        .eq("rss_url", s.rss_url);
    }
  } catch {
    // ignore
  }

  return NextResponse.json({
    ok: true,
    found_urls: uniq.length,
    inserted,
    skipped_existing: uniq.length - inserted,
    note: "Por cumplimiento, el motor solo usa fuentes con license_confirmed=true (puedes confirmarlo desde el panel).",
  });
}

