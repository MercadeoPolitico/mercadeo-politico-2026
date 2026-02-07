/**
 * Ensure .env.local has FACEBOOK_CENTRO_PAGE_ID and N8N_WEBHOOK_URL_CENTRO_FACEBOOK.
 * Derives the CI Facebook webhook URL from N8N_WEBHOOK_URL. Never prints secret values.
 * Run from repo root: node scripts/ensure-env-centro-facebook.mjs
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..");
const envPath = path.join(repoRoot, ".env.local");

const CI_FACEBOOK_WEBHOOK_PATH = "mp26-centro-informativo-facebook";
const FACEBOOK_CENTRO_PAGE_ID_VALUE = "61587865731961";

function parseDotenv(raw) {
  const env = {};
  const lines = raw.split(/\r?\n/);
  for (const line of lines) {
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

function serializeEnv(env) {
  const raw = fs.existsSync(envPath) ? fs.readFileSync(envPath, "utf8") : "";
  const lines = raw.split(/\r?\n/);
  const out = [];
  const seen = new Set();
  for (const line of lines) {
    const t = line.trim();
    if (!t || t.startsWith("#")) {
      out.push(line);
      continue;
    }
    const i = line.indexOf("=");
    if (i < 1) {
      out.push(line);
      continue;
    }
    const k = line.slice(0, i).trim();
    seen.add(k);
    if (k === "FACEBOOK_CENTRO_PAGE_ID") {
      out.push(`${k}=${env[k] ?? FACEBOOK_CENTRO_PAGE_ID_VALUE}`);
      continue;
    }
    if (k === "N8N_WEBHOOK_URL_CENTRO_FACEBOOK") {
      out.push(`${k}=${env[k] ?? ""}`);
      continue;
    }
    out.push(line);
  }
  if (!seen.has("FACEBOOK_CENTRO_PAGE_ID")) {
    out.push(`FACEBOOK_CENTRO_PAGE_ID=${FACEBOOK_CENTRO_PAGE_ID_VALUE}`);
  }
  if (!seen.has("N8N_WEBHOOK_URL_CENTRO_FACEBOOK") && env.N8N_WEBHOOK_URL_CENTRO_FACEBOOK) {
    out.push(`N8N_WEBHOOK_URL_CENTRO_FACEBOOK=${env.N8N_WEBHOOK_URL_CENTRO_FACEBOOK}`);
  }
  return out.join("\n");
}

function main() {
  if (!fs.existsSync(envPath)) {
    console.log("[ensure-env-centro-facebook] .env.local not found; creating with CI Facebook keys.");
    const content = `# Centro Informativo → Facebook Page (Meta)\nFACEBOOK_CENTRO_PAGE_ID=${FACEBOOK_CENTRO_PAGE_ID_VALUE}\n# Set N8N_WEBHOOK_URL first, then run this script again to add N8N_WEBHOOK_URL_CENTRO_FACEBOOK\n`;
    fs.writeFileSync(envPath, content, "utf8");
    process.exitCode = 0;
    return;
  }

  const raw = fs.readFileSync(envPath, "utf8");
  const env = parseDotenv(raw);
  const webhookUrl = (env.N8N_WEBHOOK_URL || env.WEBHOOK_URL || "").trim();
  let centroUrl = (env.N8N_WEBHOOK_URL_CENTRO_FACEBOOK || "").trim();
  if (!centroUrl && webhookUrl) {
    try {
      const u = new URL(webhookUrl);
      centroUrl = `${u.origin}/webhook/${CI_FACEBOOK_WEBHOOK_PATH}`;
    } catch {
      // ignore
    }
  }
  env.N8N_WEBHOOK_URL_CENTRO_FACEBOOK = centroUrl;
  env.FACEBOOK_CENTRO_PAGE_ID = env.FACEBOOK_CENTRO_PAGE_ID || FACEBOOK_CENTRO_PAGE_ID_VALUE;

  const next = serializeEnv(env);
  if (next !== raw) {
    fs.writeFileSync(envPath, next, "utf8");
    console.log("[ensure-env-centro-facebook] Updated .env.local (FACEBOOK_CENTRO_PAGE_ID, N8N_WEBHOOK_URL_CENTRO_FACEBOOK).");
  } else {
    console.log("[ensure-env-centro-facebook] .env.local already has required keys.");
  }
  process.exitCode = 0;
}

main();
