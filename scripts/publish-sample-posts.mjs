/**
 * Publish 2 sample posts via production automation (safe).
 *
 * - Calls /api/automation/candidates (token)
 * - Triggers /api/automation/editorial-orchestrate for:
 *   - Cámara (Meta)  -> José Ángel Martínez (or first Cámara candidate)
 *   - Senado (CO)    -> Eduard Buitrago Acero (or first Senado candidate)
 *
 * Prints only safe info: request_id and ok flags.
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

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

async function postJson(url, token, body) {
  const resp = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json", "x-automation-token": token },
    body: JSON.stringify(body),
    cache: "no-store",
  });
  const txt = await resp.text();
  let json = null;
  try {
    json = JSON.parse(txt);
  } catch {
    // ignore
  }
  return { ok: resp.ok, status: resp.status, json };
}

async function getJson(url, token) {
  const resp = await fetch(url, { method: "GET", headers: { "x-automation-token": token }, cache: "no-store" });
  const txt = await resp.text();
  let json = null;
  try {
    json = JSON.parse(txt);
  } catch {
    // ignore
  }
  return { ok: resp.ok, status: resp.status, json };
}

async function main() {
  const envLocal = fs.existsSync(".env.local") ? parseDotenv(fs.readFileSync(".env.local", "utf8")) : {};
  const base = (process.env.MP26_BASE_URL || envLocal.MP26_BASE_URL || "https://mercadeo-politico-2026.vercel.app").trim().replace(/\/+$/, "");
  const token = (process.env.MP26_AUTOMATION_TOKEN || envLocal.MP26_AUTOMATION_TOKEN || "").trim();
  assert(token, "Missing MP26_AUTOMATION_TOKEN");

  const candidatesUrl = `${base}/api/automation/candidates`;
  const candResp = await getJson(candidatesUrl, token);
  assert(candResp.ok && candResp.json?.ok, `candidates_failed_${candResp.status}`);
  const candidates = Array.isArray(candResp.json?.candidates) ? candResp.json.candidates : [];
  assert(candidates.length, "no_candidates");

  const byOffice = (needle) =>
    candidates.find((c) => String(c?.office || "").toLowerCase().includes(needle)) || null;

  const camara =
    candidates.find((c) => /jos[eé]/i.test(String(c?.name || "")) && String(c?.office || "").toLowerCase().includes("cámara")) ||
    byOffice("cámara") ||
    null;
  const senado =
    candidates.find((c) => /eduard/i.test(String(c?.name || "")) && String(c?.office || "").toLowerCase().includes("senado")) ||
    byOffice("senado") ||
    null;

  assert(camara?.id, "no_camara_candidate_found");
  assert(senado?.id, "no_senado_candidate_found");

  const orchUrl = `${base}/api/automation/editorial-orchestrate`;
  const a = await postJson(orchUrl, token, { candidate_id: camara.id, max_items: 1 });
  const b = await postJson(orchUrl, token, { candidate_id: senado.id, max_items: 1 });

  console.log("[publish-sample-posts] camara_ok", a.ok, "status", a.status, "request_id", a.json?.request_id ?? null);
  console.log("[publish-sample-posts] senado_ok", b.ok, "status", b.status, "request_id", b.json?.request_id ?? null);
}

main().catch((e) => {
  console.error("[publish-sample-posts] FAILED", e?.message || String(e));
  process.exit(1);
});

