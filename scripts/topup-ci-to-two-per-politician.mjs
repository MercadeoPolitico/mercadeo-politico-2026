/**
 * Ensure Centro Informativo has exactly 2 published posts per politician.
 *
 * - Calls /api/automation/editorial-orchestrate as needed (server-to-server).
 * - Then prunes extras to keep only the 2 latest.
 * - Safe: does not print secrets or full article text.
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

async function publishedCountByCandidate(sb, candidateId) {
  const r = await sb
    .from("citizen_news_posts")
    .select("id", { count: "exact", head: true })
    .eq("status", "published")
    .eq("candidate_id", candidateId);
  return r.count ?? 0;
}

async function pruneToTwoLatest(sb, candidateId) {
  const { data } = await sb
    .from("citizen_news_posts")
    .select("id,published_at")
    .eq("status", "published")
    .eq("candidate_id", candidateId)
    .order("published_at", { ascending: false })
    .limit(50);
  const rows = Array.isArray(data) ? data : [];
  if (rows.length <= 2) return { deleted: 0, kept: rows.length };
  const toDelete = rows.slice(2).map((r) => String(r.id));
  await sb.from("citizen_news_posts").delete().in("id", toDelete);
  return { deleted: toDelete.length, kept: 2 };
}

async function callOrchestrateOnce(args) {
  const { base, token, candidate_id, news_mode, news_focus } = args;
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 25_000);
  try {
    const r = await fetch(`${base}/api/automation/editorial-orchestrate`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-automation-token": token },
      body: JSON.stringify({
        candidate_id,
        max_items: 1,
        news_mode,
        ...(news_focus ? { news_focus } : {}),
        editorial_style: "noticiero_portada",
        editorial_inclination: "informativo",
      }),
      cache: "no-store",
      signal: ctrl.signal,
    }).catch(() => null);
    return Boolean(r && r.ok);
  } finally {
    clearTimeout(t);
  }
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

  const { data: pols, error } = await sb.from("politicians").select("id,office,region,auto_blog_enabled").order("id", { ascending: true });
  if (error) throw new Error("politicians_query_failed");
  const candidates = (pols ?? []).filter((p) => p && p.auto_blog_enabled !== false);

  let topped = 0;
  for (const c of candidates) {
    const candidateId = String(c.id);
    const before = await publishedCountByCandidate(sb, candidateId);
    let n = before;
    let attempts = 0;
    while (n < 2 && attempts < 3) {
      attempts++;
      const focus = String(c.office || "").toLowerCase().includes("senado") ? "Colombia seguridad instituciones" : `${String(c.region || "Colombia")} seguridad convivencia`;
      await callOrchestrateOnce({ base, token, candidate_id: candidateId, news_mode: "any", news_focus: focus });
      // Give time for async publish.
      await sleep(45_000);
      n = await publishedCountByCandidate(sb, candidateId);
    }
    await pruneToTwoLatest(sb, candidateId);
    const after = await publishedCountByCandidate(sb, candidateId);
    if (after !== before) topped++;
    console.log("[topup]", { candidate_id: candidateId, before, after, attempts });
  }

  // Final global prune pass (handles late publishes)
  await sleep(20_000);
  for (const c of candidates) await pruneToTwoLatest(sb, String(c.id));

  console.log("[topup] done", { candidates: candidates.length, touched: topped });
}

main().catch((e) => {
  console.error("[topup] FAILED", e?.message || String(e));
  process.exit(1);
});

