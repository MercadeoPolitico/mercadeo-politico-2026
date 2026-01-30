/**
 * Reset Centro Informativo to 2 posts for José + 2 for Eduard (and none for Miguel).
 *
 * - Purges ALL citizen_news_posts
 * - Enables auto_publish + auto_blog only for the two targets
 * - Disables auto_publish + auto_blog for everyone else (so “Miguel” stays empty unless he posts manually)
 * - Calls /api/automation/editorial-orchestrate twice per target (viral + grave)
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

function normalizeName(s) {
  return String(s || "")
    .toLowerCase()
    .normalize("NFKD")
    .replaceAll(/[\u0300-\u036f]/g, "")
    .trim();
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

  // Ensure global auto toggle is ON (hard-stop for auto publishing in orchestrator).
  await sb
    .from("app_settings")
    .upsert({ key: "auto_blog_global_enabled", value: "true", updated_at: new Date().toISOString() }, { onConflict: "key" });

  // Load politicians and identify targets by name (robust to accents).
  const { data: pols, error: polErr } = await sb.from("politicians").select("id,name,office,region").order("name", { ascending: true });
  if (polErr) throw new Error("politicians_query_failed");
  const list = Array.isArray(pols) ? pols : [];
  assert(list.length, "no_politicians");

  const jose = list.find((p) => normalizeName(p?.name).includes("jose") && normalizeName(p?.name).includes("martinez")) || null;
  const eduard = list.find((p) => normalizeName(p?.name).includes("eduard") && normalizeName(p?.name).includes("buitrago")) || null;
  assert(jose?.id, "target_not_found:jose");
  assert(eduard?.id, "target_not_found:eduard");

  const targets = [String(jose.id), String(eduard.id)];

  // 1) Purge Centro Informativo posts (all).
  const before = await sb.from("citizen_news_posts").select("*", { count: "exact", head: true });
  await sb.from("citizen_news_posts").delete().neq("status", "__never__");
  const after = await sb.from("citizen_news_posts").select("*", { count: "exact", head: true });
  console.log("[reset-ci] purge", { before: before.count ?? null, after: after.count ?? null });

  // 2) Disable auto for everyone, enable only for targets.
  await sb.from("politicians").update({ auto_publish_enabled: false, auto_blog_enabled: false, updated_at: new Date().toISOString() }).neq("id", "");
  await sb.from("politicians").update({ auto_publish_enabled: true, auto_blog_enabled: true, updated_at: new Date().toISOString() }).in("id", targets);

  // 3) Generate 2 posts per target: viral + grave, newspaper-like style.
  let ok = 0;
  let fail = 0;
  for (const id of targets) {
    for (const news_mode of ["viral", "grave"]) {
      // eslint-disable-next-line no-await-in-loop
      const r = await fetch(`${base}/api/automation/editorial-orchestrate`, {
        method: "POST",
        headers: { "content-type": "application/json", "x-automation-token": token },
        body: JSON.stringify({
          candidate_id: id,
          max_items: 1,
          news_mode,
          editorial_style: "noticiero_portada",
          editorial_inclination: "informativo",
        }),
        cache: "no-store",
      }).catch(() => null);
      if (r && r.ok) ok++;
      else fail++;
      // eslint-disable-next-line no-await-in-loop
      await sleep(750);
    }
  }

  // 4) Final counts (safe).
  const { data: posts } = await sb
    .from("citizen_news_posts")
    .select("candidate_id", { count: "exact" })
    .eq("status", "published");
  const counts = { total: 0, jose: 0, eduard: 0 };
  for (const row of posts ?? []) {
    counts.total++;
    if (String(row.candidate_id) === String(jose.id)) counts.jose++;
    if (String(row.candidate_id) === String(eduard.id)) counts.eduard++;
  }
  console.log("[reset-ci] done", { targets, calls_ok: ok, calls_failed: fail, published: counts });
}

main().catch((e) => {
  console.error("[reset-ci] FAILED", e?.message || String(e));
  process.exit(1);
});

