/**
 * Probe production news orchestration (real mode, safe).
 *
 * - Reads MP26_BASE_URL + token from .env.local / process env
 * - Calls /api/automation/editorial-orchestrate (without test=true)
 * - Prints ONLY safe diagnostics (no secrets, no full responses)
 */
import fs from "node:fs";

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

async function getJson(url, init) {
  const r = await fetch(url, { cache: "no-store", ...init });
  const j = await r.json().catch(() => null);
  return { status: r.status, ok: r.ok, json: j };
}

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

async function main() {
  const envLocal = fs.existsSync(".env.local") ? parseDotenv(fs.readFileSync(".env.local", "utf8")) : {};
  const base = (process.env.MP26_BASE_URL || envLocal.MP26_BASE_URL || "https://mercadeo-politico-2026.vercel.app").trim();
  const token = (
    process.env.MP26_AUTOMATION_TOKEN ||
    process.env.AUTOMATION_API_TOKEN ||
    envLocal.MP26_AUTOMATION_TOKEN ||
    envLocal.AUTOMATION_API_TOKEN ||
    ""
  ).trim();
  assert(token, "Missing MP26_AUTOMATION_TOKEN/AUTOMATION_API_TOKEN");

  console.log("[probe-news] base", base);

  // Resolve a candidate id (eligible for automation)
  const cand = await getJson(`${base}/api/automation/candidates`, { headers: { "x-automation-token": token } });
  console.log("[probe-news] candidates_status", cand.status, "ok", cand.json?.ok === true);
  assert(cand.status === 200 && cand.json?.ok === true, "automation/candidates failed");
  const first = Array.isArray(cand.json?.candidates) ? cand.json.candidates[0] : null;
  const id = first?.id ? String(first.id) : "";
  assert(id, "No candidates returned");

  // Real orchestration (may create a draft)
  const eo = await getJson(`${base}/api/automation/editorial-orchestrate`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-automation-token": token },
    body: JSON.stringify({ candidate_id: id, max_items: 1 }),
  });

  const j = eo.json || {};
  console.log("[probe-news] orchestrate_status", eo.status, "ok", j?.ok === true);
  console.log("[probe-news] orchestrate_safe", {
    ok: j?.ok === true,
    error: typeof j?.error === "string" ? j.error : null,
    request_id: typeof j?.request_id === "string" ? j.request_id : null,
    source_engine: typeof j?.source_engine === "string" ? j.source_engine : null,
    arbitration_reason: typeof j?.arbitration_reason === "string" ? j.arbitration_reason : null,
    article_found: typeof j?.article_found === "boolean" ? j.article_found : null,
    engines: typeof j?.engines === "object" && j.engines ? j.engines : null,
  });

  console.log("[probe-news] DONE", true);
}

main().catch((e) => {
  console.error("[probe-news] FAILED", e?.message || String(e));
  process.exit(1);
});

