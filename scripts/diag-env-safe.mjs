/**
 * Safe env diagnostics (NO secrets).
 *
 * Prints only:
 * - presence booleans
 * - derived Supabase project ref (from NEXT_PUBLIC_SUPABASE_URL)
 *
 * Never prints key/token values.
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

function supabaseRefFromUrl(url) {
  if (!url) return null;
  try {
    const host = new URL(url).host;
    const suffix = ".supabase.co";
    return host.endsWith(suffix) ? host.slice(0, -suffix.length) : host;
  } catch {
    return null;
  }
}

const hasEnvLocal = fs.existsSync(".env.local");
const envLocal = hasEnvLocal ? parseDotenv(fs.readFileSync(".env.local", "utf8")) : {};

const keys = [
  "NEXT_PUBLIC_SUPABASE_URL",
  "NEXT_PUBLIC_SUPABASE_ANON_KEY",
  "SUPABASE_SERVICE_ROLE_KEY",
  "SUPABASE_ACCESS_TOKEN",
  "CRON_SECRET",
  "MP26_AUTOMATION_TOKEN",
  "N8N_WEBHOOK_URL",
  "N8N_WEBHOOK_TOKEN",
  "VERCEL_TOKEN",
  "RAILWAY_TOKEN",
];

const present = {};
for (const k of keys) {
  const v = (process.env[k] ?? envLocal[k] ?? "").toString().trim();
  present[k] = Boolean(v);
}

console.log(
  JSON.stringify(
    {
      env_local: hasEnvLocal ? "present" : "missing",
      supabase_project_ref: supabaseRefFromUrl((process.env.NEXT_PUBLIC_SUPABASE_URL ?? envLocal.NEXT_PUBLIC_SUPABASE_URL ?? "").toString().trim()),
      present,
    },
    null,
    2,
  ),
);

