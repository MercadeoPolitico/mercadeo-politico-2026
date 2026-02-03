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

  let ok = 0;
  let fail = 0;
  for (const key of present) {
    const value = String(envLocal[key]).trim();
    // railway variables set KEY value (no echo of value)
    const r = spawnSync("railway", ["variables", "set", key, value], {
      stdio: ["ignore", "pipe", "pipe"],
      encoding: "utf8",
      shell: true,
    });
    if (r.status === 0) {
      ok++;
      console.log("[railway-worker-env] set", key, "(OK)");
    } else {
      fail++;
      console.error("[railway-worker-env] failed", key, r.stderr?.slice(0, 120) || r.error?.message);
    }
  }
  console.log("[railway-worker-env] done", { ok, fail });
  if (fail > 0) process.exit(2);
}

main().catch((err) => {
  console.error("[railway-worker-env] fatal", err?.message || err);
  process.exit(1);
});
