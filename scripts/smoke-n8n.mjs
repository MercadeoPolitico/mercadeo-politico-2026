/**
 * Smoke: n8n public endpoint + ensure workflow ready.
 *
 * - Reads from process.env (preferred) or .env.local (fallback)
 * - Never prints secrets
 * - Validates:
 *   - n8n base URL responds (no 502)
 *   - ensure-n8n-workflow-ready succeeds (import/activate/update/ready)
 */
import fs from "node:fs";
import { spawnSync } from "node:child_process";

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

function isTruthy(v) {
  const t = String(v ?? "").trim().toLowerCase();
  return t === "1" || t === "true" || t === "yes" || t === "on";
}

async function head(url) {
  const r = await fetch(url, { method: "HEAD", redirect: "manual", cache: "no-store" });
  return { status: r.status, ok: r.ok, headers: Object.fromEntries(r.headers.entries()) };
}

async function main() {
  const envLocal = fs.existsSync(".env.local") ? parseDotenv(fs.readFileSync(".env.local", "utf8")) : {};

  const webhookUrl = (process.env.N8N_WEBHOOK_URL || envLocal.N8N_WEBHOOK_URL || "").trim();
  const apiKey = (process.env.N8N_API_KEY || envLocal.N8N_API_KEY || "").trim();
  const basicActive = (process.env.N8N_BASIC_AUTH_ACTIVE || envLocal.N8N_BASIC_AUTH_ACTIVE || "").trim();
  const basicUser = (process.env.N8N_BASIC_AUTH_USER || envLocal.N8N_BASIC_AUTH_USER || "").trim();
  const basicPass = (process.env.N8N_BASIC_AUTH_PASSWORD || envLocal.N8N_BASIC_AUTH_PASSWORD || "").trim();
  const strict = isTruthy(process.env.SMOKE_N8N_STRICT || envLocal.SMOKE_N8N_STRICT);
  assert(webhookUrl, "Missing N8N_WEBHOOK_URL (set in shell env or .env.local)");
  if (!apiKey && !strict) {
    console.log("[smoke:n8n] SKIP (no N8N_API_KEY set)");
    return;
  }
  assert(apiKey, "Missing N8N_API_KEY (set in shell env or .env.local)");

  const base = new URL(webhookUrl).origin;
  console.log("[smoke:n8n] base", base);

  const h = await head(base);
  console.log("[smoke:n8n] head", { status: h.status, railway_fallback: h.headers["x-railway-fallback"] ?? null });
  assert(h.status !== 502, "n8n returned 502 (edge fallback); check Railway logs/permissions/port binding");

  const res = spawnSync(process.execPath, ["scripts/ensure-n8n-workflow-ready.mjs"], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    env: {
      ...process.env,
      // Ensure the ensure-script sees the required vars even if only present in .env.local.
      N8N_WEBHOOK_URL: webhookUrl,
      N8N_API_KEY: apiKey,
      ...(basicActive ? { N8N_BASIC_AUTH_ACTIVE: basicActive } : {}),
      ...(basicUser ? { N8N_BASIC_AUTH_USER: basicUser } : {}),
      ...(basicPass ? { N8N_BASIC_AUTH_PASSWORD: basicPass } : {}),
    },
  });
  if (res.status !== 0) {
    const rawOut = `${res.stdout ?? ""}\n${res.stderr ?? ""}`.trim();
    // Try to parse the ensure-script JSON output.
    let parsed = null;
    try {
      parsed = rawOut ? JSON.parse(rawOut) : null;
    } catch {
      parsed = null;
    }
    const out = rawOut.toLowerCase();
    const looksUnauthorized = out.includes("unauthorized") || out.includes("\"status\": 401") || out.includes("status\":401");
    if (looksUnauthorized && !strict) {
      // Keep it actionable, but do NOT echo any secret or raw status payload.
      console.log("[smoke:n8n] WARN n8n Public API no accesible. Para corregir: crea/rota un API key en n8n (Settings → n8n API) y actualiza N8N_API_KEY. Luego reintenta.");
      // Also print a compact safe hint if we got structured output.
      if (parsed?.details?.step) console.log("[smoke:n8n] hint_step", String(parsed.details.step));
      return;
    }
    // If strict or not unauthorized-looking: print outputs for debugging.
    if (res.stdout) process.stdout.write(res.stdout);
    if (res.stderr) process.stderr.write(res.stderr);
    assert(res.status === 0, "ensure-n8n-workflow-ready failed (check output above for auth/config hints)");
  }

  // Success path: print outputs (safe JSON).
  if (res.stdout) process.stdout.write(res.stdout);
  if (res.stderr) process.stderr.write(res.stderr);
  console.log("[smoke:n8n] DONE", true);
}

main().catch((e) => {
  console.error("[smoke:n8n] FAILED", e?.message || String(e));
  process.exit(1);
});

