/**
 * Reset Centro Informativo to 2 posts for José + 2 for Eduard + 2 for Miguel.
 *
 * - Purges ALL citizen_news_posts
 * - Enables auto_publish + auto_blog only for the 3 targets
 * - Disables auto_publish + auto_blog for everyone else
 * - Calls /api/automation/editorial-orchestrate twice per target (grave mode)
 *
 * Does NOT print any secret values.
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

async function publishedCountByCandidate(sb, candidateId) {
  const r = await sb
    .from("citizen_news_posts")
    .select("id", { count: "exact", head: true })
    .eq("status", "published")
    .eq("candidate_id", candidateId);
  return r.count ?? 0;
}

async function callOrchestrateOnce(args) {
  const { base, token, candidate_id, focus, slot, avoid_news_urls, avoid_media_urls } = args;
  const r = await fetch(`${base}/api/automation/editorial-orchestrate`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-automation-token": token },
    body: JSON.stringify({
      candidate_id,
      max_items: 1,
      news_mode: "grave",
      editorial_style: "noticiero_portada",
      editorial_inclination: "correctivo",
      news_focus: focus,
      avoid_news_urls: Array.isArray(avoid_news_urls) ? avoid_news_urls : [],
      avoid_media_urls: Array.isArray(avoid_media_urls) ? avoid_media_urls : [],
      // slot is carried in focus; server may ignore unknown fields safely
      story_slot: slot,
    }),
    cache: "no-store",
  }).catch(() => null);
  return Boolean(r && r.ok);
}

async function ensureAtLeastTwo(sb, args) {
  const { base, token, candidate_id, focuses, usedNews, usedMedia } = args;
  // Try up to 8 attempts total; stop when count reaches 2.
  // Backoff is important to avoid transient network/socket issues to Vercel.
  for (let attempt = 0; attempt < 8; attempt++) {
    // eslint-disable-next-line no-await-in-loop
    const before = await publishedCountByCandidate(sb, candidate_id);
    if (before >= 2) return { ok: true, attempts: attempt, count: before };
    const slot = attempt % focuses.length;
    // eslint-disable-next-line no-await-in-loop
    const didOk = await callOrchestrateOnce({
      base,
      token,
      candidate_id,
      focus: focuses[slot],
      slot,
      avoid_news_urls: Array.from(usedNews),
      avoid_media_urls: Array.from(usedMedia),
    });
    // eslint-disable-next-line no-await-in-loop
    await sleep(4200);
    // eslint-disable-next-line no-await-in-loop
    const after = await publishedCountByCandidate(sb, candidate_id);
    // Refresh avoid lists from DB (best-effort)
    try {
      // eslint-disable-next-line no-await-in-loop
      const { data } = await sb
        .from("citizen_news_posts")
        .select("source_url,media_urls")
        .eq("status", "published")
        .order("published_at", { ascending: false })
        .limit(30);
      for (const row of data ?? []) {
        const src = typeof row.source_url === "string" ? row.source_url.trim() : "";
        if (src) usedNews.add(src);
        const arr = Array.isArray(row.media_urls) ? row.media_urls : [];
        for (const u of arr) if (typeof u === "string" && u.trim()) usedMedia.add(u.trim());
      }
    } catch {
      // ignore
    }
    if (didOk || after > before) {
      // progress
      // eslint-disable-next-line no-await-in-loop
      await sleep(1200);
      continue;
    }
    // no progress, backoff slightly
    // eslint-disable-next-line no-await-in-loop
    await sleep(6000 + attempt * 900);
  }
  const final = await publishedCountByCandidate(sb, candidate_id);
  return { ok: final >= 2, attempts: 8, count: final };
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

  // Ensure global auto toggle is ON.
  await sb
    .from("app_settings")
    .upsert({ key: "auto_blog_global_enabled", value: "true", updated_at: new Date().toISOString() }, { onConflict: "key" });

  const { data: pols, error: polErr } = await sb.from("politicians").select("id,name").order("name", { ascending: true });
  if (polErr) throw new Error("politicians_query_failed");
  const list = Array.isArray(pols) ? pols : [];
  assert(list.length, "no_politicians");

  const jose = list.find((p) => normalizeName(p?.name).includes("jose") && normalizeName(p?.name).includes("martinez")) || null;
  const eduard = list.find((p) => normalizeName(p?.name).includes("eduard") && normalizeName(p?.name).includes("buitrago")) || null;
  const miguel = list.find((p) => normalizeName(p?.name).includes("miguel") && normalizeName(p?.name).includes("solarte")) || null;
  assert(jose?.id, "target_not_found:jose");
  assert(eduard?.id, "target_not_found:eduard");
  assert(miguel?.id, "target_not_found:miguel");

  const targets = [String(jose.id), String(eduard.id), String(miguel.id)];

  // Purge all posts
  const before = await sb.from("citizen_news_posts").select("*", { count: "exact", head: true });
  await sb.from("citizen_news_posts").delete().neq("status", "__never__");
  const after = await sb.from("citizen_news_posts").select("*", { count: "exact", head: true });
  console.log("[reset-ci-3] purge", { before: before.count ?? null, after: after.count ?? null });

  // Disable auto for everyone, enable only for targets.
  await sb.from("politicians").update({ auto_publish_enabled: false, auto_blog_enabled: false, updated_at: new Date().toISOString() }).neq("id", "");
  await sb.from("politicians").update({ auto_publish_enabled: true, auto_blog_enabled: true, updated_at: new Date().toISOString() }).in("id", targets);

  // Two posts per target, grave mode, different focus each time.
  const focuses = [
    "secuestro extorsión homicidio captura atentado",
    "accidente incendio explosión robo atraco colapso",
    "masacre sicariato narcotráfico allanamiento incautación",
    "fraude corrupción captura imputación condena",
  ];

  let ok = 0;
  let fail = 0;
  const usedNews = new Set();
  const usedMedia = new Set();
  for (const id of targets) {
    // Ensure at least 2 published posts, then prune extras down to 2.
    // eslint-disable-next-line no-await-in-loop
    const ensured = await ensureAtLeastTwo(sb, { base, token, candidate_id: id, focuses, usedNews, usedMedia });
    if (ensured.ok) ok++;
    else fail++;
    const pruned = await pruneToTwoLatest(sb, id);
    const final = await publishedCountByCandidate(sb, id);
    console.log("[reset-ci-3] candidate", { id, final, pruned, ensured });
  }

  console.log("[reset-ci-3] done", { calls_ok: ok, calls_failed: fail });
}

main().catch((e) => {
  console.error("[reset-ci-3] FAILED", e?.message || String(e));
  process.exit(1);
});

