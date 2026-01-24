/**
 * Safe: checks presence of n8n admin/API auth vars (no values).
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

const raw = fs.readFileSync(".env.local", "utf8");
const env = parseDotenv(raw);

const keys = [
  "N8N_API_KEY",
  "N8N_BASIC_AUTH_ACTIVE",
  "N8N_BASIC_AUTH_USER",
  "N8N_BASIC_AUTH_PASSWORD",
  "N8N_USER",
  "N8N_PASSWORD",
  "N8N_EDITOR_BASE_URL",
  "N8N_HOST",
];

const has = {};
for (const k of keys) has[k] = Object.prototype.hasOwnProperty.call(env, k) && String(env[k] ?? "").trim().length > 0;

console.log(JSON.stringify({ ok: true, has }, null, 2));

