/**
 * Backfill images for published citizen posts (safe, no secrets).
 *
 * - Uses MP26_AUTOMATION_TOKEN from .env.local or process.env
 * - Calls local app by default: http://localhost:3000
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

async function main() {
  const envLocal = fs.existsSync(".env.local") ? parseDotenv(fs.readFileSync(".env.local", "utf8")) : {};
  const token = (process.env.MP26_AUTOMATION_TOKEN || envLocal.MP26_AUTOMATION_TOKEN || "").trim();
  assert(token, "Missing MP26_AUTOMATION_TOKEN");

  const base = (process.env.MP26_BASE_URL || envLocal.MP26_BASE_URL || "http://localhost:3000").trim().replace(/\/+$/, "");
  const limit = Math.max(1, Math.min(50, Number(process.env.LIMIT || "20") || 20));

  const url = `${base}/api/automation/news/backfill-images?limit=${encodeURIComponent(String(limit))}`;
  const resp = await fetch(url, { method: "POST", headers: { "x-automation-token": token }, cache: "no-store" });
  const json = await resp.json().catch(() => null);
  console.log("[backfill-images]", { status: resp.status, ok: resp.ok, result: json });
  if (!resp.ok) process.exit(1);
}

main().catch((e) => {
  console.error("[backfill-images] FAILED", e?.message || String(e));
  process.exit(1);
});

