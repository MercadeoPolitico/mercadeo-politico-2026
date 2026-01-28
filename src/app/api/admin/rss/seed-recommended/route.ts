import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth/admin";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";

type RegionKey = "meta" | "colombia";

function baseUrlFromRssUrl(rss_url: string): string {
  const u = new URL(rss_url);
  return `${u.protocol}//${u.host}`;
}

function looksGovDomain(rssUrl: string): boolean {
  try {
    const host = new URL(rssUrl).host.toLowerCase();
    return host.endsWith(".gov.co") || host.endsWith(".gov");
  } catch {
    return false;
  }
}

const RECOMMENDED: Array<{ name: string; region_key: RegionKey; rss_url: string }> = [
  // Colombia (nacional)
  { name: "El Tiempo", region_key: "colombia", rss_url: "https://www.eltiempo.com/rss" },
  { name: "El Espectador", region_key: "colombia", rss_url: "https://www.elespectador.com/rss/" },
  { name: "Semana", region_key: "colombia", rss_url: "https://www.semana.com/rss/" },
  { name: "Caracol Noticias", region_key: "colombia", rss_url: "https://www.caracoltv.com/rss" },
  { name: "RCN Noticias", region_key: "colombia", rss_url: "https://www.noticiasrcn.com/rss.xml" },
  { name: "Blu Radio", region_key: "colombia", rss_url: "https://www.bluradio.com/rss" },
  { name: "La República", region_key: "colombia", rss_url: "https://www.larepublica.co/rss" },
  { name: "Portafolio", region_key: "colombia", rss_url: "https://www.portafolio.co/rss" },
  // Públicos / institucionales
  { name: "RTVC Noticias", region_key: "colombia", rss_url: "https://www.rtvcnoticias.com/rss.xml" },
  { name: "Agencia Nacional Digital", region_key: "colombia", rss_url: "https://www.and.gov.co/rss.xml" },
  // Agregadores
  { name: "Google News – Colombia (general)", region_key: "colombia", rss_url: "https://news.google.com/rss?hl=es-419&gl=CO&ceid=CO:es-419" },
  { name: "Google News – Política Colombia", region_key: "colombia", rss_url: "https://news.google.com/rss/search?q=pol%C3%ADtica+Colombia&hl=es-419&gl=CO&ceid=CO:es-419" },

  // Meta (regional)
  { name: "Llano Siete Días", region_key: "meta", rss_url: "https://llanosietedias.com/rss.xml" },
  { name: "Periódico del Meta", region_key: "meta", rss_url: "https://periodicodelmeta.com/rss" },
  { name: "Mi Llanera", region_key: "meta", rss_url: "https://milianera.com/feed/" },
  { name: "Villavicencio Noticias", region_key: "meta", rss_url: "https://villavicencionoticias.com/feed/" },
  { name: "Google News – Meta / Villavicencio", region_key: "meta", rss_url: "https://news.google.com/rss/search?q=Meta+Villavicencio&hl=es-419&gl=CO&ceid=CO:es-419" },
  { name: "Google News – Política regional (Meta)", region_key: "meta", rss_url: "https://news.google.com/rss/search?q=pol%C3%ADtica+Meta+Colombia&hl=es-419&gl=CO&ceid=CO:es-419" },
];

export async function POST() {
  await requireAdmin();
  const admin = createSupabaseAdminClient();
  if (!admin) return NextResponse.json({ ok: false, error: "not_configured" }, { status: 503 });

  const now = new Date().toISOString();
  const urls = RECOMMENDED.map((r) => r.rss_url);

  const { data: existing } = await admin.from("news_rss_sources").select("rss_url").in("rss_url", urls);
  const existingSet = new Set((existing ?? []).map((r: any) => String(r?.rss_url ?? "").trim()).filter(Boolean));

  const toInsert = RECOMMENDED.filter((r) => !existingSet.has(r.rss_url)).map((r) => {
    const usage_policy = looksGovDomain(r.rss_url) ? "open_government" : "unknown";
    const license_confirmed = looksGovDomain(r.rss_url);
    return {
      name: r.name,
      region_key: r.region_key,
      rss_url: r.rss_url,
      base_url: baseUrlFromRssUrl(r.rss_url),
      active: true,
      // Guardrail: only auto-confirm when clearly open government.
      license_confirmed,
      usage_policy,
      updated_at: now,
    };
  });

  if (toInsert.length) {
    const { error } = await admin.from("news_rss_sources").insert(toInsert);
    if (error) return NextResponse.json({ ok: false, error: "insert_failed" }, { status: 500 });
  }

  return NextResponse.json({
    ok: true,
    inserted: toInsert.length,
    already_present: RECOMMENDED.length - toInsert.length,
    note: "Por cumplimiento, el motor solo usa fuentes con license_confirmed=true (puedes confirmarlo desde el panel si tienes permiso).",
  });
}

