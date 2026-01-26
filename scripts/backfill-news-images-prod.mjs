/**
 * Backfill Centro Informativo images in production (safe).
 *
 * - Reads token from .env.local (never prints values).
 * - Calls the automation endpoint to replace fallback images with CC (Wikimedia) or first-party AI images.
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

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

async function getJson(url, init) {
  const r = await fetch(url, { cache: "no-store", ...init });
  const j = await r.json().catch(() => null);
  return { status: r.status, ok: r.ok, json: j };
}

async function main() {
  const base = process.env.MP26_BASE_URL?.trim() || "https://mercadeo-politico-2026.vercel.app";
  const envLocal = parseDotenv(fs.readFileSync(".env.local", "utf8"));
  const token = (
    process.env.MP26_AUTOMATION_TOKEN ||
    process.env.AUTOMATION_API_TOKEN ||
    envLocal.MP26_AUTOMATION_TOKEN ||
    envLocal.AUTOMATION_API_TOKEN ||
    ""
  ).trim();
  assert(token, "Missing MP26_AUTOMATION_TOKEN/AUTOMATION_API_TOKEN (set in shell env or .env.local)");

  const dryRun = process.argv.includes("--dry-run");
  const limitArg = process.argv.find((a) => a.startsWith("--limit="));
  const limit = limitArg ? Number(limitArg.split("=")[1]) : 12;
  const safeLimit = Number.isFinite(limit) ? Math.max(1, Math.min(50, Math.floor(limit))) : 12;

  const url = `${base}/api/automation/news/backfill-images?dry_run=${dryRun ? "true" : "false"}&limit=${safeLimit}`;
  const r = await getJson(url, { method: "POST", headers: { "x-automation-token": token } });
  console.log("[backfill] status", r.status, "ok", r.json?.ok === true, "dry_run", r.json?.dry_run === true);
  console.log("[backfill] updated", r.json?.updated ?? null, "skipped", r.json?.skipped ?? null);
  if (Array.isArray(r.json?.updated_ids)) console.log("[backfill] updated_ids", r.json.updated_ids.slice(0, 10));
  if (!r.ok) process.exit(1);
}

main().catch((e) => {
  console.error("[backfill] FAILED", e?.message || String(e));
  process.exit(1);
});

