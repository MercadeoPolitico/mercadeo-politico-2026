/**
 * Purge current "Centro Informativo" posts and regenerate 2 posts per politician.
 *
 * - Uses Supabase service role from .env.local (or process.env)
 * - Uses MP26_BASE_URL + MP26_AUTOMATION_TOKEN to call /api/automation/editorial-orchestrate
 * - Does NOT print any secret values
 *
 * Optional: CI_SKIP_PURGE=1 — skip local purge (use after calling POST /api/automation/ci-purge).
 * Use MP26_BASE_URL=https://mercadeo-politico-2026.vercel.app so the API runs deployed image logic.
 */
import fs from "node:fs";
import { createRequire } from "node:module";

const { createClient } = createRequire(import.meta.url)("@supabase/supabase-js");

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

async function withTimeout(promise, ms) {
  let t = null;
  const timeout = new Promise((_, rej) => {
    t = setTimeout(() => rej(new Error("timeout")), ms);
  });
  try {
    return await Promise.race([promise, timeout]);
  } finally {
    if (t) clearTimeout(t);
  }
}

async function settleDelay() {
  // The orchestrator can take >25s and may finish after the HTTP client times out.
  // This delay gives Vercel enough time to commit the publish before we prune/validate.
  await sleep(35_000);
}

async function publishedCountByCandidate(sb, candidateId) {
  const r = await withTimeout(
    sb
      .from("citizen_news_posts")
      .select("id", { count: "exact", head: true })
      .eq("status", "published")
      .eq("candidate_id", candidateId),
    12_000,
  ).catch(() => null);
  return (r && typeof r.count === "number" ? r.count : 0) ?? 0;
}

async function pruneToTwoLatest(sb, candidateId) {
  const r = await withTimeout(
    sb
      .from("citizen_news_posts")
      .select("id,published_at")
      .eq("status", "published")
      .eq("candidate_id", candidateId)
      .order("published_at", { ascending: false })
      .limit(50),
    12_000,
  ).catch(() => null);
  const data = r && Array.isArray(r.data) ? r.data : null;
  const rows = Array.isArray(data) ? data : [];
  if (rows.length <= 2) return { deleted: 0, kept: rows.length };
  const toDelete = rows.slice(2).map((r) => String(r.id));
  await withTimeout(sb.from("citizen_news_posts").delete().in("id", toDelete), 12_000).catch(() => null);
  return { deleted: toDelete.length, kept: 2 };
}

function stableIndexFromId(id, mod) {
  const s = String(id || "");
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h + s.charCodeAt(i) * 17) >>> 0;
  return mod ? h % mod : 0;
}

async function callOrchestrateOnce(args) {
  const { base, token, candidate_id, news_mode, news_focus } = args;
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 25_000);
  try {
    const started = Date.now();
    console.log("[orchestrate:call]", {
      candidate_id,
      news_mode,
      news_focus: news_focus ? String(news_focus).slice(0, 80) : null,
    });
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
    console.log("[orchestrate:done]", {
      candidate_id,
      news_mode,
      ok: Boolean(r && r.ok),
      status: r ? r.status : null,
      ms: Date.now() - started,
    });
    return Boolean(r && r.ok);
  } catch (e) {
    const name = typeof e?.name === "string" ? e.name : "";
    console.log("[orchestrate:error]", { candidate_id, news_mode, error: name || "unknown" });
    return false;
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

  // 0) Ensure global auto toggle is ON (hard-stop for auto-publishing).
  {
    const at = new Date().toISOString();
    const { error } = await sb
      .from("app_settings")
      .upsert({ key: "auto_blog_global_enabled", value: "true", updated_at: at }, { onConflict: "key" });
    if (error) throw new Error(`app_settings_upsert_failed:${error.message || "unknown"}`);
  }

  // 1) Ensure auto_publish is ON for all politicians (requested default ON).
  {
    const { error } = await sb.from("politicians").update({ auto_publish_enabled: true, auto_blog_enabled: true }).neq("id", "");
    if (error) throw new Error(`politicians_update_failed:${error.message || "unknown"}`);
  }

  // 2) Purge current Centro Informativo posts (unless CI_SKIP_PURGE=1, e.g. after calling POST /api/automation/ci-purge).
  const skipPurge = /^1|true|yes$/i.test(String(process.env.CI_SKIP_PURGE ?? "").trim());
  if (!skipPurge) {
    const before = await sb.from("citizen_news_posts").select("*", { count: "exact", head: true });
    const beforeCount = before.count ?? null;
    const { error } = await sb.from("citizen_news_posts").delete().neq("status", "__never__");
    if (error) throw new Error(`purge_failed:${error.message || "unknown"}`);
    const after = await sb.from("citizen_news_posts").select("*", { count: "exact", head: true });
    console.log("[purge] citizen_news_posts", { before: beforeCount, after: after?.count ?? null });
  } else {
    console.log("[purge] skipped (CI_SKIP_PURGE=1)");
  }

  // 3) Regenerate 2 published posts per politician, with validation (not just "2 calls").
  const { data: pols, error: polErr } = await sb.from("politicians").select("id,office,region,auto_blog_enabled").order("id", { ascending: true });
  if (polErr) throw new Error("politicians_query_failed");
  const candidates = (pols ?? []).filter((p) => p && p.auto_blog_enabled !== false);

  let okCount = 0;
  let failCount = 0;
  let ensuredTwo = 0;
  let ensuredFail = 0;

  // Vary focus to reduce duplicate_source_url skips and keep content unique.
  const focusViral = [
    "economía empleo emprendimiento",
    "educación juventud",
    "salud pública hospitales",
    "infraestructura vías movilidad",
    "seguridad convivencia comunidad",
    "servicios públicos agua energía",
  ];
  const focusGrave = [
    "secuestro extorsión amenaza",
    "homicidio captura violencia",
    "corrupción contratación fraude",
    "narcotráfico incautación bandas",
    "accidente vías emergencia",
    "orden público ataque conflicto",
  ];

  for (const c of candidates) {
    const candidateId = String(c.id);
    console.log("[candidate:start]", { candidate_id: candidateId, office: String(c.office || ""), region: String(c.region || "") });
    const i0v = stableIndexFromId(candidateId, focusViral.length);
    const i0g = stableIndexFromId(candidateId, focusGrave.length);
    const focuses = [
      { mode: "viral", focus: focusViral[i0v] || focusViral[0] },
      { mode: "grave", focus: focusGrave[i0g] || focusGrave[0] },
    ];

    // Make at least 2 attempts (viral+grave), then validate count and top-up if needed.
    for (const f of focuses) {
      // eslint-disable-next-line no-await-in-loop
      const beforeN = await publishedCountByCandidate(sb, candidateId);
      // eslint-disable-next-line no-await-in-loop
      const didOk = await callOrchestrateOnce({ base, token, candidate_id: candidateId, news_mode: f.mode, news_focus: f.focus });
      // eslint-disable-next-line no-await-in-loop
      await settleDelay();
      // eslint-disable-next-line no-await-in-loop
      const afterN = await publishedCountByCandidate(sb, candidateId);
      console.log("[orchestrate:delta]", { candidate_id: candidateId, mode: f.mode, before: beforeN, after: afterN, didOk });
      if (didOk || afterN > beforeN) okCount++;
      else failCount++;
    }

    // Top-up: if duplicate_source_url prevented publishing, try up to 3 extra calls with "any" and varied focus.
    for (let extra = 0; extra < 3; extra++) {
      // eslint-disable-next-line no-await-in-loop
      const n = await publishedCountByCandidate(sb, candidateId);
      if (n >= 2) break;
      const focus = extra % 2 === 0 ? focusViral[(i0v + 2 + extra) % focusViral.length] : focusGrave[(i0g + 2 + extra) % focusGrave.length];
      // eslint-disable-next-line no-await-in-loop
      const beforeN = n;
      // eslint-disable-next-line no-await-in-loop
      const didOk = await callOrchestrateOnce({ base, token, candidate_id: candidateId, news_mode: "any", news_focus: focus });
      // eslint-disable-next-line no-await-in-loop
      await settleDelay();
      // eslint-disable-next-line no-await-in-loop
      const afterN = await publishedCountByCandidate(sb, candidateId);
      console.log("[orchestrate:delta]", { candidate_id: candidateId, mode: "any", before: beforeN, after: afterN, didOk });
      if (didOk || afterN > beforeN) okCount++;
      else failCount++;
    }

    // Final settle + prune, to catch late publishes.
    // eslint-disable-next-line no-await-in-loop
    await sleep(20_000);
    // eslint-disable-next-line no-await-in-loop
    await pruneToTwoLatest(sb, candidateId);

    // Enforce exactly 2 (delete extras if any).
    // eslint-disable-next-line no-await-in-loop
    const pruned = await pruneToTwoLatest(sb, candidateId);
    // eslint-disable-next-line no-await-in-loop
    const finalN = await publishedCountByCandidate(sb, candidateId);
    if (finalN === 2) ensuredTwo++;
    else ensuredFail++;

    console.log("[candidate]", { candidate_id: candidateId, final: finalN, pruned });
  }

  const final = await sb.from("citizen_news_posts").select("*", { count: "exact", head: true }).eq("status", "published");
  console.log("[regenerate] done", {
    candidates: candidates.length,
    ensured_two_each: ensuredTwo,
    ensured_failed: ensuredFail,
    calls_ok: okCount,
    calls_failed: failCount,
    published_count: final.count ?? null,
  });
}

main().catch((e) => {
  console.error("[purge-regenerate] FAILED", e?.message || String(e));
  process.exit(1);
});

