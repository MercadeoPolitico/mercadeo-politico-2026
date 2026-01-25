/**
 * Generate 1 real "Centro Informativo" post per politician (only if missing).
 *
 * - Uses Supabase service role from .env.local (or process.env)
 * - Calls /api/automation/editorial-orchestrate (token) to generate + auto-publish
 * - Ensures auto_publish_enabled is ON (so editorial-orchestrate auto-publishes)
 * - Does NOT print any secret values
 */
import fs from "node:fs";
import { createClient } from "@supabase/supabase-js";

function parseDotenv(raw) {
  const env = {};
  for (const line of raw.split(/\r?\n/)) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const i = t.indexOf("=");
    if (i < 1) continue;
    const k = t.slice(0, i).trim();
    let v = t.slice(i + 1).trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
    if (v.endsWith("\\n")) v = v.slice(0, -2);
    env[k] = v;
  }
  return env;
}

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

async function sleep(ms) {
  await new Promise((r) => setTimeout(r, ms));
}

async function main() {
  const envLocal = fs.existsSync(".env.local") ? parseDotenv(fs.readFileSync(".env.local", "utf8")) : {};

  const base = (process.env.MP26_BASE_URL || envLocal.MP26_BASE_URL || envLocal.NEXT_PUBLIC_SITE_URL || "https://mercadeo-politico-2026.vercel.app")
    .trim()
    .replace(/\/+$/, "");
  const token = (process.env.MP26_AUTOMATION_TOKEN || envLocal.MP26_AUTOMATION_TOKEN || "").trim();
  assert(token, "Missing MP26_AUTOMATION_TOKEN");

  const url = (process.env.NEXT_PUBLIC_SUPABASE_URL || envLocal.NEXT_PUBLIC_SUPABASE_URL || "").trim();
  const key = (process.env.SUPABASE_SERVICE_ROLE_KEY || envLocal.SUPABASE_SERVICE_ROLE_KEY || "").trim();
  assert(url, "Missing NEXT_PUBLIC_SUPABASE_URL");
  assert(key, "Missing SUPABASE_SERVICE_ROLE_KEY");
  const sb = createClient(url, key, { auth: { persistSession: false } });

  // Ensure global auto-blog toggle is ON (default is ON; we enforce in case it was turned off).
  await sb
    .from("app_settings")
    .upsert({ key: "auto_blog_global_enabled", value: "true", updated_at: new Date().toISOString() }, { onConflict: "key" });

  const { data: pols, error: polErr } = await sb.from("politicians").select("id,slug,auto_publish_enabled").order("id", { ascending: true });
  if (polErr) throw new Error("politicians_query_failed");
  const politicians = (pols ?? []).filter((p) => p && typeof p.id === "string" && p.id.trim());
  assert(politicians.length, "no_politicians");

  let created = 0;
  let skipped = 0;
  let failed = 0;

  for (const p of politicians) {
    const id = String(p.id);

    const existing = await sb
      .from("citizen_news_posts")
      .select("id", { count: "exact", head: true })
      .eq("status", "published")
      .eq("candidate_id", id);

    const hasAny = (existing.count ?? 0) > 0;
    if (hasAny) {
      skipped++;
      continue;
    }

    // Ensure this candidate can auto-publish.
    if (p.auto_publish_enabled !== true) {
      await sb.from("politicians").update({ auto_publish_enabled: true, updated_at: new Date().toISOString() }).eq("id", id);
    }

    const r = await fetch(`${base}/api/automation/editorial-orchestrate`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-automation-token": token },
      body: JSON.stringify({ candidate_id: id, max_items: 1, editorial_style: "noticiero_portada", editorial_inclination: "persuasivo_suave" }),
      cache: "no-store",
    }).catch(() => null);

    if (r && r.ok) created++;
    else failed++;

    // Stagger to avoid bursts / rate limits.
    await sleep(900);
  }

  const final = await sb.from("citizen_news_posts").select("id", { count: "exact", head: true }).eq("status", "published");
  console.log("[generate-one-post-per-politician] done", {
    politicians: politicians.length,
    created,
    skipped_existing: skipped,
    failed,
    published_total: final.count ?? null,
  });
}

main().catch((e) => {
  console.error("[generate-one-post-per-politician] FAILED", e?.message || String(e));
  process.exit(1);
});

