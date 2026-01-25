/**
 * Sync the repo workflow JSON into n8n without using the UI.
 *
 * Requires:
 * - N8N_API_KEY (preferred, from n8n Settings → n8n API)
 * - N8N_EDITOR_BASE_URL (optional; otherwise derived from N8N_WEBHOOK_URL)
 *
 * Notes:
 * - Does NOT print secrets.
 * - Uses n8n Public API endpoints (/api/v1/*).
 */
import fs from "node:fs";

const WORKFLOW_PATH = "docs/automation/n8n-master-editorial-orchestrator.json";

function envBool(name) {
  const v = String(process.env[name] ?? "").trim().toLowerCase();
  return v === "1" || v === "true" || v === "yes" || v === "on";
}

function basicAuthHeaderFromEnv() {
  if (!envBool("N8N_BASIC_AUTH_ACTIVE")) return null;
  const user = String(process.env.N8N_BASIC_AUTH_USER ?? "").trim();
  const pass = String(process.env.N8N_BASIC_AUTH_PASSWORD ?? "").trim();
  if (!user || !pass) return null;
  const token = Buffer.from(`${user}:${pass}`, "utf8").toString("base64");
  return `Basic ${token}`;
}

function required(name, v) {
  if (!v || !String(v).trim()) throw new Error(`Missing env: ${name}`);
  return String(v).trim();
}

function baseUrlFromWebhookUrl(u) {
  try {
    const url = new URL(String(u));
    return url.origin;
  } catch {
    return null;
  }
}

async function httpJson(url, { method = "GET", headers = {}, body } = {}) {
  const resp = await fetch(url, {
    method,
    headers: { accept: "application/json", ...headers },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await resp.text();
  let json = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = null;
  }
  return { ok: resp.ok, status: resp.status, json };
}

function pickWorkflowName(workflowJson) {
  return String(workflowJson?.name ?? "").trim();
}

async function main() {
  const apiKey = required("N8N_API_KEY", process.env.N8N_API_KEY);
  const base =
    String(process.env.N8N_EDITOR_BASE_URL ?? "").trim() ||
    baseUrlFromWebhookUrl(process.env.N8N_WEBHOOK_URL) ||
    baseUrlFromWebhookUrl(process.env.WEBHOOK_URL);
  if (!base) throw new Error("Missing env: N8N_EDITOR_BASE_URL (or N8N_WEBHOOK_URL/WEBHOOK_URL as a valid URL)");

  const raw = fs.readFileSync(WORKFLOW_PATH, "utf8");
  const workflow = JSON.parse(raw);
  const name = pickWorkflowName(workflow);
  if (!name) throw new Error(`Workflow JSON missing name: ${WORKFLOW_PATH}`);

  const basic = basicAuthHeaderFromEnv();
  const authHeaders = {
    "X-N8N-API-KEY": apiKey,
    "content-type": "application/json",
    ...(basic ? { authorization: basic } : {}),
  };

  // 1) List workflows and find existing by name
  const list = await httpJson(`${base}/api/v1/workflows`, { headers: authHeaders });
  if (!list.ok) {
    console.log(JSON.stringify({ ok: false, step: "list_workflows", status: list.status }, null, 2));
    process.exit(1);
  }

  const items = Array.isArray(list.json?.data) ? list.json.data : Array.isArray(list.json) ? list.json : [];
  const existing = items.find((w) => String(w?.name ?? "").trim() === name) ?? null;

  // 2) Upsert
  if (!existing?.id) {
    const created = await httpJson(`${base}/api/v1/workflows`, {
      method: "POST",
      headers: authHeaders,
      body: { ...workflow, active: true },
    });
    console.log(JSON.stringify({ ok: created.ok, step: "create", status: created.status }, null, 2));
    process.exit(created.ok ? 0 : 1);
  }

  const updated = await httpJson(`${base}/api/v1/workflows/${existing.id}`, {
    method: "PUT",
    headers: authHeaders,
    body: { ...workflow, id: existing.id, active: true },
  });
  console.log(JSON.stringify({ ok: updated.ok, step: "update", status: updated.status }, null, 2));
  process.exit(updated.ok ? 0 : 1);
}

main().catch((e) => {
  console.log(JSON.stringify({ ok: false, error: String(e?.message ?? e) }, null, 2));
  process.exit(1);
});

