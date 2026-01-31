/**
 * Verify env points to the expected project (NO secrets printed).
 *
 * Expected:
 * - Supabase ref: adjawofpdxnezbmwafvg
 * - Vercel project id: prj_IB0em6dvzKfyHwYTlf5IY9cd73I6 (optional, from VERCEL_OIDC_TOKEN or VERCEL_PROJECT_ID)
 * - Railway project id: 565f0511-128f-4817-be87-f290a8d9cf20 (optional, not in env; for reference)
 *
 * Prints only: ok/ref/project_id hints and MP26_BASE_URL domain (no tokens/keys).
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
    return host.endsWith(".supabase.co") ? host.slice(0, -".supabase.co".length) : host;
  } catch {
    return null;
  }
}

function domainFromUrl(url) {
  if (!url || typeof url !== "string") return null;
  const u = url.trim().replace(/\/+$/, "");
  try {
    return new URL(u.startsWith("http") ? u : `https://${u}`).host;
  } catch {
    return null;
  }
}

// Decode JWT payload only (no verify) to read project_id from VERCEL_OIDC_TOKEN
function projectIdFromOidcToken(token) {
  if (!token || typeof token !== "string") return null;
  const parts = token.trim().split(".");
  if (parts.length !== 3) return null;
  try {
    const payload = JSON.parse(Buffer.from(parts[1], "base64url").toString("utf8"));
    return payload.project_id ?? null;
  } catch {
    return null;
  }
}

const EXPECTED_SUPABASE_REF = "adjawofpdxnezbmwafvg";
const EXPECTED_VERCEL_PROJECT_ID = "prj_IB0em6dvzKfyHwYTlf5IY9cd73I6";

const hasEnvLocal = fs.existsSync(".env.local");
const envLocal = hasEnvLocal ? parseDotenv(fs.readFileSync(".env.local", "utf8")) : {};

const supabaseUrl = (process.env.NEXT_PUBLIC_SUPABASE_URL ?? envLocal.NEXT_PUBLIC_SUPABASE_URL ?? "").toString().trim();
const supabaseRef = supabaseRefFromUrl(supabaseUrl);
const supabaseOk = supabaseRef === EXPECTED_SUPABASE_REF;

const baseUrl = (process.env.MP26_BASE_URL ?? envLocal.MP26_BASE_URL ?? envLocal.NEXT_PUBLIC_SITE_URL ?? "").toString().trim();
const siteUrl = (process.env.NEXT_PUBLIC_SITE_URL ?? envLocal.NEXT_PUBLIC_SITE_URL ?? "").toString().trim();
const baseDomain = domainFromUrl(baseUrl || (siteUrl ? `https://${siteUrl}` : ""));

const vercelProjectId = process.env.VERCEL_PROJECT_ID ?? envLocal.VERCEL_PROJECT_ID ?? projectIdFromOidcToken(process.env.VERCEL_OIDC_TOKEN ?? envLocal.VERCEL_OIDC_TOKEN ?? "");
const vercelOk = !EXPECTED_VERCEL_PROJECT_ID || vercelProjectId === EXPECTED_VERCEL_PROJECT_ID;

const out = {
  env_local: hasEnvLocal ? "present" : "missing",
  supabase: {
    ref: supabaseRef ?? "missing",
    expected: EXPECTED_SUPABASE_REF,
    ok: supabaseOk,
  },
  vercel: {
    project_id_hint: vercelProjectId ? `${vercelProjectId.slice(0, 12)}...` : "not_in_env",
    expected: EXPECTED_VERCEL_PROJECT_ID,
    ok: vercelOk,
  },
  mp26_base: {
    domain: baseDomain ?? "not_set",
    is_production: baseDomain === "mercadeo-politico-2026.vercel.app" || baseDomain?.endsWith(".vercel.app"),
  },
  railway_note: "Railway project 565f0511-... is not stored in env; used for deploy reference only.",
};

console.log(JSON.stringify(out, null, 2));
if (!supabaseOk) {
  console.error("[verify-project-env] Supabase ref mismatch. Expected", EXPECTED_SUPABASE_REF);
  process.exit(1);
}
if (!vercelOk && vercelProjectId) {
  console.error("[verify-project-env] Vercel project_id mismatch. Expected", EXPECTED_VERCEL_PROJECT_ID);
  process.exit(1);
}
