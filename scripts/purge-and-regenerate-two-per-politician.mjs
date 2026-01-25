/**
 * Purge current "Centro Informativo" posts and regenerate 2 posts per politician.
 *
 * - Uses Supabase service role from .env.local (or process.env)
 * - Uses MP26_BASE_URL + MP26_AUTOMATION_TOKEN to call /api/automation/editorial-orchestrate
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

  const base = (process.env.MP26_BASE_URL || envLocal.MP26_BASE_URL || envLocal.NEXT_PUBLIC_SITE_URL || "").trim().replace(/\/+$/, "");
  const token = (process.env.MP26_AUTOMATION_TOKEN || envLocal.MP26_AUTOMATION_TOKEN || "").trim();
  assert(base, "Missing MP26_BASE_URL (or NEXT_PUBLIC_SITE_URL)");
  assert(token, "Missing MP26_AUTOMATION_TOKEN");

  const url = (process.env.NEXT_PUBLIC_SUPABASE_URL || envLocal.NEXT_PUBLIC_SUPABASE_URL || "").trim();
  const key = (process.env.SUPABASE_SERVICE_ROLE_KEY || envLocal.SUPABASE_SERVICE_ROLE_KEY || "").trim();
  assert(url, "Missing NEXT_PUBLIC_SUPABASE_URL");
  assert(key, "Missing SUPABASE_SERVICE_ROLE_KEY");
  const sb = createClient(url, key, { auth: { persistSession: false } });

  // 1) Ensure auto_publish is ON for all politicians (requested default ON).
  {
    const { error } = await sb.from("politicians").update({ auto_publish_enabled: true }).neq("id", "");
    if (error) throw new Error(`politicians_update_failed:${error.message || "unknown"}`);
  }

  // 2) Purge current Centro Informativo posts.
  const before = await sb.from("citizen_news_posts").select("*", { count: "exact", head: true });
  const beforeCount = before.count ?? null;
  {
    // citizen_news_posts.id is uuid; comparing to "" can fail. Use a safe always-true predicate.
    const { error } = await sb.from("citizen_news_posts").delete().neq("status", "__never__");
    if (error) throw new Error(`purge_failed:${error.message || "unknown"}`);
  }

  const after = await sb.from("citizen_news_posts").select("*", { count: "exact", head: true });
  const afterCount = after.count ?? null;

  console.log("[purge] citizen_news_posts", { before: beforeCount, after: afterCount });

  // 3) Regenerate 2 drafts/posts per politician by calling orchestrator twice.
  const { data: pols, error: polErr } = await sb.from("politicians").select("id,office,region,auto_blog_enabled").order("id", { ascending: true });
  if (polErr) throw new Error("politicians_query_failed");
  const candidates = (pols ?? []).filter((p) => p && p.auto_blog_enabled !== false);

  let okCount = 0;
  let failCount = 0;

  for (const c of candidates) {
    for (let i = 0; i < 2; i++) {
      // eslint-disable-next-line no-await-in-loop
      const r = await fetch(`${base}/api/automation/editorial-orchestrate`, {
        method: "POST",
        headers: { "content-type": "application/json", "x-automation-token": token },
        body: JSON.stringify({ candidate_id: c.id, max_items: 1, editorial_style: "noticiero_portada", editorial_inclination: "persuasivo_suave" }),
        cache: "no-store",
      });
      if (r.ok) okCount++;
      else failCount++;
      // Small stagger to avoid burst rate limits
      // eslint-disable-next-line no-await-in-loop
      await sleep(650);
    }
  }

  const final = await sb.from("citizen_news_posts").select("*", { count: "exact", head: true }).eq("status", "published");
  console.log("[regenerate] done", { candidates: candidates.length, calls_ok: okCount, calls_failed: failCount, published_count: final.count ?? null });
}

main().catch((e) => {
  console.error("[purge-regenerate] FAILED", e?.message || String(e));
  process.exit(1);
});

