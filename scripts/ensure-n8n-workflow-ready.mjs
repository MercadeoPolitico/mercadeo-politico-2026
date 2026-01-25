/**
 * Ensure the n8n workflow exists, is active, and its webhook path matches N8N_WEBHOOK_URL.
 *
 * Output (always JSON, no secrets):
 * - { status: "ready" | "imported" | "activated" | "updated" | "error", details }
 *
 * Requirements:
 * - N8N_API_KEY (used as header: X-N8N-API-KEY)
 * - N8N_WEBHOOK_URL (used to derive expected webhook path)
 *
 * Notes:
 * - This uses n8n Public API endpoints (/api/v1/*). Some deployments run under a base path
 *   (e.g. `/n8n`), so we auto-detect the correct prefix.
 * - If your n8n instance returns 401 even with the API key, you must enable the Public API in n8n.
 */
import fs from "node:fs";

const WORKFLOW_JSON_PATH = "docs/automation/n8n-master-editorial-orchestrator.json";
const TARGET_NAME = "MP26 — Master Editorial Orchestrator";

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
  if (fs.existsSync(".env.local")) {
    const env = parseDotenv(fs.readFileSync(".env.local", "utf8"));
    const vv = String(env[name] ?? "").trim();
    if (vv) return vv;
  }
  return "";
}

function envBool(name) {
  const v = getEnv(name).toLowerCase();
  return v === "1" || v === "true" || v === "yes" || v === "on";
}

function basicAuthHeader() {
  // n8n Public API can still be protected by Basic Auth at the app layer.
  // If enabled, we must send both Basic Auth and X-N8N-API-KEY.
  if (!envBool("N8N_BASIC_AUTH_ACTIVE")) return null;
  const user = getEnv("N8N_BASIC_AUTH_USER");
  const pass = getEnv("N8N_BASIC_AUTH_PASSWORD");
  if (!user || !pass) return null;
  const token = Buffer.from(`${user}:${pass}`, "utf8").toString("base64");
  return `Basic ${token}`;
}

function baseUrlFromWebhookUrl(webhookUrl) {
  const u = new URL(webhookUrl);
  return u.origin;
}

function expectedWebhookPathFromUrl(webhookUrl) {
  const u = new URL(webhookUrl);
  const p = u.pathname;
  const m = p.match(/\/webhook(?:-test)?\/([^/?#]+)/);
  if (!m) return null;
  return m[1];
}

async function discoverApiPrefix(base, headers) {
  // Try common prefixes. Railway deployments sometimes expose n8n under /n8n.
  const candidates = ["", "/n8n"];
  for (const pref of candidates) {
    // eslint-disable-next-line no-await-in-loop
    const r = await httpJson(`${base}${pref}/api/v1/workflows`, { headers });
    if (r.ok) return pref;
  }
  return null;
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

function workflowHasWebhookPath(workflow, expectedPath) {
  const nodes = Array.isArray(workflow?.nodes) ? workflow.nodes : [];
  const wh = nodes.find((n) => n?.type === "n8n-nodes-base.webhook");
  const current = String(wh?.parameters?.path ?? "").trim();
  const method = String(wh?.parameters?.httpMethod ?? "").trim().toUpperCase();
  return { ok: Boolean(current && expectedPath && current === expectedPath), current, method };
}

function withUpdatedWebhookConfig(workflow, expectedPath) {
  const nodes = Array.isArray(workflow?.nodes) ? workflow.nodes : [];
  const nextNodes = nodes.map((n) => {
    if (n?.type !== "n8n-nodes-base.webhook") return n;
    // Ensure POST, since our backend sends JSON payload via POST.
    return { ...n, parameters: { ...(n.parameters ?? {}), path: expectedPath, httpMethod: "POST" } };
  });
  return { ...workflow, nodes: nextNodes };
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

  const expectedPath = expectedWebhookPathFromUrl(webhookUrl);
  if (!expectedPath) {
    console.log(
      JSON.stringify({ status: "error", details: { error: "invalid_webhook_url", reason: "missing_/webhook/<path>" } }, null, 2),
    );
    process.exitCode = 1;
    return;
  }

  const base = baseUrlFromWebhookUrl(webhookUrl);
  const basic = basicAuthHeader();
  const headers = {
    "X-N8N-API-KEY": apiKey,
    "content-type": "application/json",
    ...(basic ? { authorization: basic } : {}),
  };

  const apiPrefix = await discoverApiPrefix(base, headers);
  if (apiPrefix === null) {
    console.log(
      JSON.stringify(
        {
          status: "error",
          details: {
            step: "discover_api_prefix",
            status: 401,
            message: "unauthorized",
            hint:
              "Enable n8n Public API and use a valid N8N_API_KEY. If Basic Auth is enabled, set N8N_BASIC_AUTH_ACTIVE=true and provide N8N_BASIC_AUTH_USER/PASSWORD.",
          },
        },
        null,
        2,
      ),
    );
    process.exitCode = 1;
    return;
  }

  // 1) List workflows
  const list = await httpJson(`${base}${apiPrefix}/api/v1/workflows`, { headers });
  if (!list.ok) {
    console.log(
      JSON.stringify(
        {
          status: "error",
          details: { step: "list_workflows", status: list.status, message: list.json?.message ?? "request_failed" },
        },
        null,
        2,
      ),
    );
    process.exitCode = 1;
    return;
  }

  const items = Array.isArray(list.json?.data) ? list.json.data : Array.isArray(list.json) ? list.json : [];
  const existing = items.find((w) => String(w?.name ?? "").trim() === TARGET_NAME) ?? null;

  const desired = JSON.parse(fs.readFileSync(WORKFLOW_JSON_PATH, "utf8"));

  // 2) Create if missing
  if (!existing?.id) {
    const createdWorkflow = withUpdatedWebhookConfig(desired, expectedPath);
    const created = await httpJson(`${base}${apiPrefix}/api/v1/workflows`, {
      method: "POST",
      headers,
      body: { ...createdWorkflow, active: true },
    });
    const status = created.ok ? "imported" : "error";
    console.log(JSON.stringify({ status, details: { step: "create", http_status: created.status } }, null, 2));
    process.exitCode = created.ok ? 0 : 1;
    return;
  }

  // 3) Fetch full workflow, then update path/active if needed
  const fetched = await httpJson(`${base}${apiPrefix}/api/v1/workflows/${existing.id}`, { headers });
  if (!fetched.ok) {
    console.log(JSON.stringify({ status: "error", details: { step: "fetch", http_status: fetched.status } }, null, 2));
    process.exitCode = 1;
    return;
  }

  const current = fetched.json?.data ?? fetched.json ?? {};
  const active = Boolean(current.active);
  const pathCheck = workflowHasWebhookPath(current, expectedPath);
  const methodOk = pathCheck.method === "POST";

  const needsUpdate = !pathCheck.ok || !methodOk || !active;
  if (!needsUpdate) {
    console.log(JSON.stringify({ status: "ready", details: { workflow_id: existing.id } }, null, 2));
    process.exitCode = 0;
    return;
  }

  const merged = withUpdatedWebhookConfig({ ...current, ...desired, id: existing.id }, expectedPath);
  const updated = await httpJson(`${base}${apiPrefix}/api/v1/workflows/${existing.id}`, {
    method: "PUT",
    headers,
    body: { ...merged, active: true },
  });

  if (!updated.ok) {
    console.log(JSON.stringify({ status: "error", details: { step: "update", http_status: updated.status } }, null, 2));
    process.exitCode = 1;
    return;
  }

  const status = active ? "updated" : "activated";
  console.log(
    JSON.stringify(
      { status, details: { workflow_id: existing.id, fixed_path: !pathCheck.ok, fixed_method: !methodOk, apiPrefix } },
      null,
      2,
    ),
  );
  process.exitCode = 0;
}

main().catch((e) => {
  console.log(JSON.stringify({ status: "error", details: { error: String(e?.message ?? e) } }, null, 2));
  process.exitCode = 1;
});

