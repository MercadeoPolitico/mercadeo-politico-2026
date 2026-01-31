/**
 * Call POST /api/automation/ci-purge (no Supabase dependency).
 * Reads .env.local for MP26_BASE_URL and MP26_AUTOMATION_TOKEN. Does NOT print secrets.
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

const envLocal = fs.existsSync(".env.local") ? parseDotenv(fs.readFileSync(".env.local", "utf8")) : {};
const base = (process.env.MP26_BASE_URL || envLocal.MP26_BASE_URL || envLocal.NEXT_PUBLIC_SITE_URL || "").trim().replace(/\/+$/, "");
const token = (process.env.MP26_AUTOMATION_TOKEN || envLocal.MP26_AUTOMATION_TOKEN || "").trim();

if (!base || !token) {
  console.error("Missing MP26_BASE_URL and/or MP26_AUTOMATION_TOKEN (set in .env.local or env)");
  process.exit(1);
}

const url = `${base}/api/automation/ci-purge`;
const res = await fetch(url, {
  method: "POST",
  headers: { "content-type": "application/json", "x-automation-token": token },
});
const j = await res.json().catch(() => ({}));
if (!res.ok) {
  console.error("[ci-purge] failed", res.status, j);
  process.exit(1);
}
console.log("[ci-purge] ok", j);
