/**
 * Verifica conexión con Vercel (app), Supabase, Railway (keepalive) y n8n.
 * Lee .env.local; no imprime secretos.
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

async function getJson(url, init = {}) {
  const r = await fetch(url, { cache: "no-store", ...init }).catch(() => null);
  if (!r) return { status: null, ok: false, json: null };
  const json = await r.json().catch(() => null);
  return { status: r.status, ok: r.ok, json };
}

async function head(url) {
  const r = await fetch(url, { method: "HEAD", redirect: "manual", cache: "no-store" }).catch(() => null);
  return r ? { status: r.status, ok: r.ok } : { status: null, ok: false };
}

async function main() {
  const envLocal = fs.existsSync(".env.local") ? parseDotenv(fs.readFileSync(".env.local", "utf8")) : {};
  const base = (process.env.MP26_BASE_URL || envLocal.MP26_BASE_URL || "https://mercadeo-politico-2026.vercel.app")
    .trim()
    .replace(/\/+$/, "");
  const cronSecret = (process.env.CRON_SECRET || envLocal.CRON_SECRET || "").trim();
  const webhookUrl = (process.env.N8N_WEBHOOK_URL || envLocal.N8N_WEBHOOK_URL || "").trim();

  const out = { vercel: null, supabase: null, railway_keepalive: null, n8n: null };

  console.log("[verify] Vercel (app) + Supabase …");
  const health = await getJson(`${base}/api/health/supabase`);
  out.vercel = health.status !== null ? { status: health.status, ok: health.ok } : { status: null, ok: false };
  out.supabase =
    health.json?.ok === true
      ? { ok: true, env: health.json.env, runtime: health.json.runtime }
      : { ok: false, status: health.status };

  if (out.vercel.ok) console.log("[verify] Vercel + Supabase OK", health.status);
  else console.log("[verify] Vercel/Supabase FAIL", health.status, health.json?.ok);

  console.log("[verify] Railway (keepalive) …");
  if (cronSecret) {
    const keep = await getJson(`${base}/api/cron/keepalive`, {
      headers: { Authorization: `Bearer ${cronSecret}` },
    });
    out.railway_keepalive =
      keep.json?.ok === true ? { ok: true, at: keep.json.at, services: keep.json.services } : { ok: false, status: keep?.status };
    if (out.railway_keepalive.ok) console.log("[verify] Railway keepalive OK");
    else console.log("[verify] Railway keepalive FAIL", keep?.status);
  } else {
    out.railway_keepalive = { ok: false, reason: "CRON_SECRET not set" };
    console.log("[verify] Railway keepalive SKIP (no CRON_SECRET)");
  }

  console.log("[verify] n8n …");
  if (webhookUrl) {
    try {
      const n8nOrigin = new URL(webhookUrl).origin;
      const h = await head(n8nOrigin);
      out.n8n = { ok: h.status !== 502 && h.status !== 500, status: h.status };
      if (out.n8n.ok) console.log("[verify] n8n OK", h.status);
      else console.log("[verify] n8n FAIL", h.status);
    } catch (e) {
      out.n8n = { ok: false, error: String(e?.message || e).slice(0, 80) };
      console.log("[verify] n8n FAIL", out.n8n.error);
    }
  } else {
    out.n8n = { ok: null, reason: "N8N_WEBHOOK_URL not set" };
    console.log("[verify] n8n SKIP (no N8N_WEBHOOK_URL)");
  }

  console.log("[verify] summary", JSON.stringify(out, null, 2));
  const fail =
    !out.vercel?.ok ||
    !out.supabase?.ok ||
    (out.railway_keepalive?.ok === false && out.railway_keepalive?.reason !== "CRON_SECRET not set") ||
    (out.n8n?.ok === false);
  if (fail) process.exit(1);
}

main().catch((e) => {
  console.error("[verify] FAILED", e?.message || String(e));
  process.exit(1);
});
