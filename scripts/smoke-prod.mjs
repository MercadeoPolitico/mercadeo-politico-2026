/**
 * Production smoke tests for mercadeo-politico-2026.
 *
 * - Reads tokens from .env.local (never prints values).
 * - Hits Vercel production endpoints.
 * - Verifies automation inserts (self-test + orchestrate test mode).
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
    // Fix accidental trailing literal \n in copied secrets (common).
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
  const base = process.env.MP26_BASE_URL?.trim() || "https://mercadeo-politico-2026.vercel.app";
  const envLocal = parseDotenv(fs.readFileSync(".env.local", "utf8"));
  // Prefer process env (CI/local shell), fallback to .env.local.
  const token = (
    process.env.MP26_AUTOMATION_TOKEN ||
    process.env.AUTOMATION_API_TOKEN ||
    envLocal.MP26_AUTOMATION_TOKEN ||
    envLocal.AUTOMATION_API_TOKEN ||
    ""
  ).trim();
  assert(token, "Missing MP26_AUTOMATION_TOKEN/AUTOMATION_API_TOKEN (set in shell env or .env.local)");

  console.log("[smoke] base", base);

  // 1) Health checks
  for (const p of ["/api/health/supabase", "/api/health/marleny", "/api/health/openai"]) {
    const r = await getJson(`${base}${p}`);
    console.log("[smoke] health", p, "status", r.status, "ok", r.json?.ok === true);
    assert(r.status === 200, `Health endpoint failed: ${p} (${r.status})`);
  }

  // 2) Candidates list (automation)
  const cand = await getJson(`${base}/api/automation/candidates`, { headers: { "x-automation-token": token } });
  console.log(
    "[smoke] candidates",
    "status",
    cand.status,
    "ok",
    cand.json?.ok === true,
    "count",
    Array.isArray(cand.json?.candidates) ? cand.json.candidates.length : null,
  );
  assert(cand.status === 200, `automation/candidates failed (${cand.status})`);
  const firstId =
    Array.isArray(cand.json?.candidates) && cand.json.candidates[0]?.id ? String(cand.json.candidates[0].id) : "";
  assert(firstId, "No candidates returned from automation/candidates");

  // 3) Self-test insert
  const st = await getJson(`${base}/api/automation/self-test`, { headers: { "x-automation-token": token } });
  console.log(
    "[smoke] self-test",
    "status",
    st.status,
    "ok",
    st.json?.ok === true,
    "inserted_id_present",
    typeof st.json?.inserted_id === "string",
    "total_drafts_count_present",
    typeof st.json?.total_drafts_count === "number",
  );
  assert(st.status === 200 && st.json?.ok === true, `automation/self-test failed (${st.status})`);
  assert(typeof st.json?.inserted_id === "string", "self-test did not return inserted_id");

  // 4) Orchestrate test mode insert
  const eo = await getJson(`${base}/api/automation/editorial-orchestrate?test=true`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-automation-token": token },
    body: JSON.stringify({ candidate_id: firstId, max_items: 1 }),
  });
  console.log(
    "[smoke] orchestrate test",
    "status",
    eo.status,
    "ok",
    eo.json?.ok === true,
    "inserted_id_present",
    typeof eo.json?.inserted_id === "string",
    "draft_id_present",
    typeof eo.json?.draft_id === "string",
    "id_present",
    typeof eo.json?.id === "string",
  );
  assert(eo.status === 200 && eo.json?.ok === true, `automation/editorial-orchestrate test failed (${eo.status})`);

  console.log("[smoke] DONE", true);
}

main().catch((e) => {
  console.error("[smoke] FAILED", e?.message || String(e));
  process.exit(1);
});

