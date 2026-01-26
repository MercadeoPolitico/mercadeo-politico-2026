/**
 * Probe n8n API endpoints (safe).
 *
 * Purpose:
 * - Diagnose 401/404 issues without printing secrets.
 *
 * It tries common API base paths and endpoints:
 * - /api/v1/workflows (Public API)
 * - /rest/workflows (legacy/internal)
 *
 * Output: JSON only, no secrets.
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

function envLocal() {
  return fs.existsSync(".env.local") ? parseDotenv(fs.readFileSync(".env.local", "utf8")) : {};
}

function getEnv(name) {
  return String(process.env[name] ?? envLocal()[name] ?? "").trim();
}

function basicAuthHeader() {
  const active = String(getEnv("N8N_BASIC_AUTH_ACTIVE")).trim().toLowerCase();
  if (!(active === "1" || active === "true" || active === "yes" || active === "on")) return null;
  const user = getEnv("N8N_BASIC_AUTH_USER");
  const pass = getEnv("N8N_BASIC_AUTH_PASSWORD");
  if (!user || !pass) return null;
  const token = Buffer.from(`${user}:${pass}`, "utf8").toString("base64");
  return `Basic ${token}`;
}

async function req(url, headers) {
  try {
    const r = await fetch(url, { method: "GET", headers, cache: "no-store", redirect: "manual" });
    return { ok: r.ok, status: r.status };
  } catch (e) {
    return { ok: false, status: -1, error: String(e?.message ?? e) };
  }
}

async function main() {
  const webhookUrl = getEnv("N8N_WEBHOOK_URL");
  const apiKey = getEnv("N8N_API_KEY");
  if (!webhookUrl) {
    console.log(JSON.stringify({ ok: false, error: "missing_env", missing: ["N8N_WEBHOOK_URL"] }, null, 2));
    process.exit(1);
  }
  const base = new URL(webhookUrl).origin;
  const basic = basicAuthHeader();

  const baseHeaders = {
    accept: "application/json",
    ...(basic ? { authorization: basic } : {}),
    ...(apiKey ? { "X-N8N-API-KEY": apiKey } : {}),
  };

  const prefixes = ["", "/n8n"];
  const endpoints = ["/api/v1/workflows", "/rest/workflows", "/api/v1/healthz", "/healthz"];

  const results = [];
  for (const pref of prefixes) {
    for (const ep of endpoints) {
      // eslint-disable-next-line no-await-in-loop
      const r = await req(`${base}${pref}${ep}`, baseHeaders);
      results.push({ url: `${pref}${ep}`, status: r.status });
    }
  }

  console.log(
    JSON.stringify(
      {
        ok: true,
        base,
        has: { api_key: Boolean(apiKey), basic_auth: Boolean(basic) },
        results,
      },
      null,
      2,
    ),
  );
}

main().catch((e) => {
  console.log(JSON.stringify({ ok: false, error: String(e?.message ?? e) }, null, 2));
  process.exit(1);
});

