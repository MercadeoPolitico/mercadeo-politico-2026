import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { fetchTopGdeltArticle } from "@/lib/news/gdelt";

export const runtime = "nodejs";

function normalizeToken(v: unknown): string {
  const s = String(v ?? "").trim();
  if (!s) return "";
  if ((s.startsWith('"') && s.endsWith('"')) || (s.startsWith("'") && s.endsWith("'"))) return s.slice(1, -1).trim();
  return s.endsWith("\\n") ? s.slice(0, -2).trim() : s;
}

function requireCronAuth(req: Request): boolean {
  const secret = normalizeToken(process.env.CRON_SECRET);
  if (!secret) return false;
  const auth = normalizeToken(req.headers.get("authorization") ?? "");
  return auth === `Bearer ${secret}`;
}

function newsQueryFor(office: string, region: string): string {
  const off = String(office || "").toLowerCase();
  const reg = String(region || "").trim();
  if (off.includes("senado")) return "Colombia seguridad";
  if (!reg) return "Colombia seguridad";
  return `${reg} Colombia seguridad`;
}

function isHighImpactTitle(title: string): boolean {
  const t = String(title || "").toLowerCase();
  if (!t) return false;
  const hits = ["secuestro", "extors", "homicid", "asesin", "sicari", "masacre", "atent", "explosi", "captur", "incaut", "narcot", "corrup", "fraude", "violenc", "paro", "bloqueo", "amenaza"];
  return hits.some((k) => t.includes(k));
}

function hoursAgo(seendate: string): number {
  const t = Date.parse(seendate);
  if (!Number.isFinite(t)) return Number.POSITIVE_INFINITY;
  return (Date.now() - t) / 3_600_000;
}

async function getAppSetting(admin: any, key: string): Promise<string | null> {
  const { data } = await admin.from("app_settings").select("value").eq("key", key).maybeSingle();
  return data && typeof data.value === "string" ? String(data.value) : null;
}

function parseEnabled(v: string | null): boolean {
  if (v === null) return true;
  return v.trim().toLowerCase() !== "false";
}

export async function GET(req: Request) {
  if (!requireCronAuth(req)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const apiToken = normalizeToken(process.env.MP26_AUTOMATION_TOKEN ?? process.env.AUTOMATION_API_TOKEN);
  if (!apiToken) return NextResponse.json({ error: "not_configured" }, { status: 503 });

  const admin = createSupabaseAdminClient();
  if (!admin) return NextResponse.json({ error: "supabase_not_configured" }, { status: 503 });

  // Respect global automation master switch (controlled in Admin → Contenido).
  const enabled = parseEnabled(await getAppSetting(admin, "auto_blog_global_enabled"));
  if (!enabled) return NextResponse.json({ ok: true, enabled: false, skipped: true, reason: "global_off" });

  const { data: cands } = await admin
    .from("politicians")
    .select("id,office,region,auto_blog_enabled")
    .eq("auto_blog_enabled", true)
    .order("id", { ascending: true });

  const candidates = (cands ?? []) as Array<{ id: string; office: string; region: string; auto_blog_enabled: boolean }>;

  const origin = new URL(req.url).origin;
  const target = `${origin}/api/automation/editorial-orchestrate`;

  const results: Array<{ candidate_id: string; triggered: boolean; reason: string; source_url?: string }> = [];

  for (const c of candidates) {
    const q = newsQueryFor(c.office, c.region);
    // eslint-disable-next-line no-await-in-loop
    const a = await fetchTopGdeltArticle(q, { prefer_sensational: true });
    if (!a || !a.url || !a.seendate) {
      results.push({ candidate_id: c.id, triggered: false, reason: "no_article" });
      // eslint-disable-next-line no-continue
      continue;
    }

    const recent = hoursAgo(a.seendate) <= 2;
    const high = isHighImpactTitle(a.title);
    if (!recent || !high) {
      results.push({ candidate_id: c.id, triggered: false, reason: "not_breaking", source_url: a.url });
      // eslint-disable-next-line no-continue
      continue;
    }

    // Avoid duplicating the same breaking URL repeatedly.
    // eslint-disable-next-line no-await-in-loop
    const { data: drafts } = await admin
      .from("ai_drafts")
      .select("id,created_at,metadata")
      .eq("candidate_id", c.id)
      .order("created_at", { ascending: false })
      .limit(15);
    const alreadyUsed = (drafts ?? []).some((d: any) => {
      const meta = d?.metadata && typeof d.metadata === "object" ? (d.metadata as any) : null;
      const src = typeof meta?.source_url === "string" ? meta.source_url : typeof meta?.news?.url === "string" ? meta.news.url : "";
      return src && src === a.url;
    });
    if (alreadyUsed) {
      results.push({ candidate_id: c.id, triggered: false, reason: "already_used", source_url: a.url });
      // eslint-disable-next-line no-continue
      continue;
    }

    const inclination = "correctivo";
    // eslint-disable-next-line no-await-in-loop
    const resp = await fetch(target, {
      method: "POST",
      headers: { "content-type": "application/json", "x-automation-token": apiToken },
      body: JSON.stringify({
        candidate_id: c.id,
        max_items: 1,
        news_links: [a.url],
        editorial_notes: "Breaking sweep: noticia de alto impacto (generación adicional).",
        editorial_inclination: inclination,
        editorial_style: "noticiero_portada",
      }),
      cache: "no-store",
    });
    if (resp.ok) results.push({ candidate_id: c.id, triggered: true, reason: "triggered", source_url: a.url });
    else results.push({ candidate_id: c.id, triggered: false, reason: "engine_failed", source_url: a.url });
  }

  const triggered_count = results.filter((r) => r.triggered).length;
  return NextResponse.json({ ok: true, triggered_count, results });
}

