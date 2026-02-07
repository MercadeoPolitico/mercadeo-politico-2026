/**
 * Ensure the n8n "Centro Informativo → Facebook Page" workflow exists and is active.
 * Uses N8N_API_KEY and N8N_WEBHOOK_URL (base URL). Never prints secrets.
 * Run from repo root: node scripts/ensure-n8n-centro-facebook-workflow.mjs
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..");
const WORKFLOW_JSON_PATH = path.join(repoRoot, "docs/automation/n8n-centro-informativo-facebook.json");
const TARGET_NAME = "MP26 — Centro Informativo → Facebook Page";
const EXPECTED_WEBHOOK_PATH = "mp26-centro-informativo-facebook";

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

function getEnv(name) {
  const v = String(process.env[name] ?? "").trim();
  if (v) return v;
  const envPath = path.join(repoRoot, ".env.local");
  if (fs.existsSync(envPath)) {
    const env = parseDotenv(fs.readFileSync(envPath, "utf8"));
    return String(env[name] ?? "").trim();
  }
  return "";
}

function baseUrlFromWebhookUrl(webhookUrl) {
  try {
    const u = new URL(webhookUrl);
    return u.origin;
  } catch {
    return "";
  }
}

async function discoverApiPrefix(base, headers) {
  for (const pref of ["", "/n8n"]) {
    const r = await fetch(`${base}${pref}/api/v1/workflows`, { headers: { accept: "application/json", ...headers } });
    if (r.ok) return pref;
  }
  return null;
}

async function main() {
  const apiKey = getEnv("N8N_API_KEY");
  const webhookUrl = getEnv("N8N_WEBHOOK_URL") || getEnv("WEBHOOK_URL");
  if (!apiKey) {
    console.log(JSON.stringify({ status: "error", details: { error: "missing_env", missing: "N8N_API_KEY" } }, null, 2));
    process.exitCode = 1;
    return;
  }
  if (!webhookUrl) {
    console.log(JSON.stringify({ status: "error", details: { error: "missing_env", missing: "N8N_WEBHOOK_URL" } }, null, 2));
    process.exitCode = 1;
    return;
  }

  const base = baseUrlFromWebhookUrl(webhookUrl);
  if (!base) {
    console.log(JSON.stringify({ status: "error", details: { error: "invalid_webhook_url" } }, null, 2));
    process.exitCode = 1;
    return;
  }

  const headers = {
    "X-N8N-API-KEY": apiKey,
    "content-type": "application/json",
  };
  if (getEnv("N8N_BASIC_AUTH_ACTIVE").toLowerCase() === "true") {
    const user = getEnv("N8N_BASIC_AUTH_USER");
    const pass = getEnv("N8N_BASIC_AUTH_PASSWORD");
    if (user && pass) {
      headers.authorization = `Basic ${Buffer.from(`${user}:${pass}`, "utf8").toString("base64")}`;
    }
  }

  const apiPrefix = await discoverApiPrefix(base, headers);
  if (apiPrefix === null) {
    console.log(JSON.stringify({ status: "error", details: { step: "discover_api_prefix", message: "unauthorized" } }, null, 2));
    process.exitCode = 1;
    return;
  }

  const listRes = await fetch(`${base}${apiPrefix}/api/v1/workflows`, { headers });
  const listJson = await listRes.json().catch(() => ({}));
  const items = Array.isArray(listJson?.data) ? listJson.data : Array.isArray(listJson) ? listJson : [];
  const existing = items.find((w) => String(w?.name ?? "").trim() === TARGET_NAME) ?? null;

  const desired = JSON.parse(fs.readFileSync(WORKFLOW_JSON_PATH, "utf8"));

  if (!existing?.id) {
    const createRes = await fetch(`${base}${apiPrefix}/api/v1/workflows`, {
      method: "POST",
      headers,
      body: JSON.stringify({ ...desired, active: true }),
    });
    const status = createRes.ok ? "imported" : "error";
    console.log(JSON.stringify({ status, details: { step: "create", http_status: createRes.status } }, null, 2));
    process.exitCode = createRes.ok ? 0 : 1;
    return;
  }

  const getRes = await fetch(`${base}${apiPrefix}/api/v1/workflows/${existing.id}`, { headers });
  if (!getRes.ok) {
    console.log(JSON.stringify({ status: "error", details: { step: "fetch", http_status: getRes.status } }, null, 2));
    process.exitCode = 1;
    return;
  }
  const getJson = await getRes.json();
  const current = getJson?.data ?? getJson ?? {};
  const active = Boolean(current.active);
  const pathOk = current?.nodes?.some((n) => n?.type === "n8n-nodes-base.webhook" && (n?.parameters?.path ?? "").trim() === EXPECTED_WEBHOOK_PATH);

  if (active && pathOk) {
    console.log(JSON.stringify({ status: "ready", details: { workflow_id: existing.id } }, null, 2));
    process.exitCode = 0;
    return;
  }

  const merged = { ...current, ...desired, id: existing.id, active: true };
  const putRes = await fetch(`${base}${apiPrefix}/api/v1/workflows/${existing.id}`, {
    method: "PUT",
    headers,
    body: JSON.stringify(merged),
  });
  if (!putRes.ok) {
    console.log(JSON.stringify({ status: "error", details: { step: "update", http_status: putRes.status } }, null, 2));
    process.exitCode = 1;
    return;
  }
  console.log(JSON.stringify({ status: "activated", details: { workflow_id: existing.id } }, null, 2));
  process.exitCode = 0;
}

main().catch((e) => {
  const errMsg = String(e?.message ?? e);
  const cause = e?.cause ? String(e.cause?.message ?? e.cause) : undefined;
  console.log(JSON.stringify({ status: "error", details: { error: errMsg, cause: cause || undefined } }, null, 2));
  process.exitCode = 1;
});
