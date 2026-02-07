/**
 * Sync Worker env vars from .env.local to Railway (Worker service).
 * Never prints secret values. Requires: railway CLI, railway link to Worker project.
 *
 * Sets: MP26_BASE_URL, CRON_SECRET
 * Run from repo root: node scripts/railway-sync-worker-env.mjs
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

const keys = ["MP26_BASE_URL", "CRON_SECRET"];

async function main() {
  const envLocal = fs.existsSync(".env.local") ? parseDotenv(fs.readFileSync(".env.local", "utf8")) : {};
  const present = keys.filter((k) => typeof envLocal[k] === "string" && envLocal[k].trim().length);
  if (present.length === 0) {
    console.log("[railway-worker-env] No syncable vars in .env.local (need MP26_BASE_URL, CRON_SECRET)");
    process.exit(0);
    return;
  }

  // Use npx so project devDependency @railway/cli is used (RECONNECT.md)
  // Railway CLI v3: railway variables --set "KEY=value" [--set "K2=V2" ...]
  const setArgs = present.flatMap((k) => ["--set", `${k}=${String(envLocal[k]).trim()}`]);
  const r = spawnSync("npx", ["--yes", "railway", "variables", ...setArgs], {
    stdio: ["ignore", "pipe", "pipe"],
    encoding: "utf8",
    cwd: process.cwd(),
    shell: process.platform === "win32",
  });
  if (r.status === 0) {
    console.log("[railway-worker-env] set", present.join(", "), "(OK)");
  } else {
    console.error("[railway-worker-env] failed", r.stderr?.slice(0, 200) || r.error?.message);
    process.exit(2);
  }
  console.log("[railway-worker-env] done");
}

main().catch((err) => {
  console.error("[railway-worker-env] fatal", err?.message || err);
  process.exit(1);
});
