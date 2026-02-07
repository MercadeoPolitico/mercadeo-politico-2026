/**
 * Sync n8n-related env vars from .env.local to Railway (n8n service).
 * Never prints secret values. Requires: railway CLI, railway link to n8n service.
 *
 * Sets: N8N_WEBHOOK_TOKEN, FACEBOOK_CENTRO_PAGE_ID, FACEBOOK_CENTRO_PAGE_TOKEN
 * Run from repo root: node scripts/railway-sync-n8n-env.mjs
 *
 * Before first run: npx railway link (select the n8n service, not the Worker).
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
    const key = t.slice(0, i).trim();
    let val = t.slice(i + 1).trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) val = val.slice(1, -1);
    if (val.endsWith("\\n")) val = val.slice(0, -2);
    env[key] = val;
  }
  return env;
}

const keys = [
  "N8N_WEBHOOK_TOKEN",
  "WEBHOOK_TOKEN",
  "MP26_AUTOMATION_TOKEN",
  "FACEBOOK_CENTRO_PAGE_ID",
  "FACEBOOK_CENTRO_PAGE_TOKEN",
  "FACEBOOK_CENTRO_INFORMATIVO_PAGE_TOKEN",
];

async function main() {
  const envLocal = fs.existsSync(".env.local") ? parseDotenv(fs.readFileSync(".env.local", "utf8")) : {};
  const toSet = [];
  const tokenKey = keys.find((k) => envLocal[k] && ["N8N_WEBHOOK_TOKEN", "WEBHOOK_TOKEN", "MP26_AUTOMATION_TOKEN"].includes(k));
  if (tokenKey) toSet.push({ key: "N8N_WEBHOOK_TOKEN", value: envLocal[tokenKey] });
  if (envLocal.FACEBOOK_CENTRO_PAGE_ID) toSet.push({ key: "FACEBOOK_CENTRO_PAGE_ID", value: envLocal.FACEBOOK_CENTRO_PAGE_ID });
  const tokenFb =
    envLocal.FACEBOOK_CENTRO_PAGE_TOKEN ||
    envLocal.FACEBOOK_CENTRO_INFORMATIVO_PAGE_TOKEN ||
    envLocal.FACEBOOK_CENTRO_PAGE_ACCESS_TOKEN;
  if (tokenFb) toSet.push({ key: "FACEBOOK_CENTRO_PAGE_TOKEN", value: tokenFb });

  if (toSet.length === 0) {
    console.log("[railway-n8n-env] No syncable vars in .env.local (need N8N_WEBHOOK_TOKEN, FACEBOOK_CENTRO_PAGE_ID, FACEBOOK_CENTRO_PAGE_TOKEN)");
    process.exit(0);
    return;
  }

  const setArgs = toSet.flatMap(({ key, value }) => ["--set", `${key}=${String(value).trim()}`]);
  const r = spawnSync("npx", ["--yes", "railway", "variables", ...setArgs], {
    stdio: ["ignore", "pipe", "pipe"],
    encoding: "utf8",
    cwd: process.cwd(),
    shell: process.platform === "win32",
  });
  if (r.status === 0) {
    console.log("[railway-n8n-env] set", toSet.map((x) => x.key).join(", "), "(OK)");
  } else {
    console.error("[railway-n8n-env] failed", r.stderr?.slice(0, 300) || r.error?.message);
    process.exit(2);
  }
  console.log("[railway-n8n-env] done");
}

main().catch((err) => {
  console.error("[railway-n8n-env] fatal", err?.message || err);
  process.exit(1);
});
