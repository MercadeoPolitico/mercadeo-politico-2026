/**
 * Sync required env vars from .env.local to Vercel Production.
 *
 * - Never prints secret values.
 * - Uses Vercel REST API with Bearer token.
 * - Upserts vars (creates or updates).
 *
 * Required env:
 *   - VERCEL_TOKEN (Vercel Personal Token)
 */

import fs from "node:fs";

function readText(p) {
  return fs.readFileSync(p, "utf8");
}

function parseDotenv(raw) {
  const env = {};
  for (const line of raw.split(/\r?\n/)) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const i = t.indexOf("=");
    if (i < 1) continue;
    const key = t.slice(0, i).trim();
    let val = t.slice(i + 1).trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    // Fix accidental trailing literal \n in some keys (common when copy/pasting).
    if (val.endsWith("\\n")) val = val.slice(0, -2);
    env[key] = val;
  }
  return env;
}

async function vercelApi(token, path, { method = "GET", body } = {}) {
  const resp = await fetch(`https://api.vercel.com${path}`, {
    method,
    headers: {
      authorization: `Bearer ${token}`,
      "content-type": "application/json",
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const json = await resp.json().catch(() => null);
  return { ok: resp.ok, status: resp.status, json };
}

async function main() {
  const token = process.env.VERCEL_TOKEN;
  if (!token || !token.trim()) throw new Error("Missing VERCEL_TOKEN");

  const project = JSON.parse(readText(".vercel/project.json"));
  const projectId = project.projectId;
  const teamId = project.orgId;
  if (!projectId || !teamId) throw new Error("Missing .vercel project linkage");

  // Quick auth check (no secrets).
  const me = await vercelApi(token, "/v2/user");
  if (!me.ok) throw new Error(`Vercel token unauthorized (status ${me.status})`);

  const envLocal = parseDotenv(readText(".env.local"));

  // Only sync what the app actually needs at runtime in Production.
  const keys = [
    // Supabase runtime (server + browser)
    "NEXT_PUBLIC_SUPABASE_URL",
    "NEXT_PUBLIC_SUPABASE_ANON_KEY",
    "SUPABASE_SERVICE_ROLE_KEY",

    // Synthetic Intelligence engines
    "OPENAI_API_KEY",
    "OPENAI_BASE_URL",
    "OPENAI_MODEL",
    "MARLENY_API_KEY",
    "MARLENY_API_URL",

    // Automation tokens
    "MP26_AUTOMATION_TOKEN",
    "AUTOMATION_API_TOKEN",

    // n8n forwarding (optional but requested)
    "N8N_WEBHOOK_URL",
    "N8N_WEBHOOK_TOKEN",
    "WEBHOOK_URL",
    "WEBHOOK_TOKEN",
    "N8N_FORWARD_ENABLED",

    // Optional site
    "NEXT_PUBLIC_SITE_URL",
  ];

  const present = keys.filter((k) => typeof envLocal[k] === "string" && envLocal[k].trim().length);
  if (present.length === 0) throw new Error("No syncable env vars found in .env.local");

  let updated = 0;
  let failed = 0;

  for (const key of present) {
    // Normalize OpenAI base URL if user stored .../v1
    let value = String(envLocal[key]);
    if (key === "OPENAI_BASE_URL") {
      value = value.replace(/\/+$/, "");
      if (value.endsWith("/v1")) value = value.slice(0, -3);
    }

    const res = await vercelApi(token, `/v10/projects/${projectId}/env?upsert=true&teamId=${teamId}`, {
      method: "POST",
      body: {
        key,
        value,
        type: "encrypted",
        target: ["production"],
      },
    });

    if (res.ok) {
      updated++;
    } else {
      failed++;
      const msg = res.json?.error?.message || res.json?.message || null;
      console.error("[vercel-env] failed", { key, status: res.status, message: msg });
    }
  }

  console.log("[vercel-env] done", { updated, failed, projectId, teamId });
  if (failed > 0) process.exit(2);
}

main().catch((err) => {
  console.error("[vercel-env] fatal", { message: err?.message || String(err) });
  process.exit(1);
});

