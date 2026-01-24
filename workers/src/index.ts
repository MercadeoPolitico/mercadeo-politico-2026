/**
 * Railway Worker — Scheduler + keepalive (real)
 *
 * Goals:
 * - Avoid “sleep”/cold starts (Railway/n8n/Supabase-friendly)
 * - Run cron-like jobs even if Vercel Cron is restricted (Hobby limits)
 * - Never print secrets (ever)
 *
 * This worker calls the app's cron endpoints using CRON_SECRET:
 * - GET /api/cron/keepalive  (keeps Supabase + external URLs warm)
 * - GET /api/cron/auto-blog  (1 news per politician every N hours; default 4h)
 */

type PingResult = { ok: boolean; status: number | null; ms: number; path: string };

function normalizeToken(v: unknown): string {
  const s = String(v ?? "").trim();
  if (!s) return "";
  if ((s.startsWith('"') && s.endsWith('"')) || (s.startsWith("'") && s.endsWith("'"))) return s.slice(1, -1).trim();
  return s.endsWith("\\n") ? s.slice(0, -2).trim() : s;
}

function baseUrl(): string {
  const raw = normalizeToken(process.env.MP26_BASE_URL ?? process.env.APP_BASE_URL ?? "");
  return raw.replace(/\/+$/, "");
}

function cronSecret(): string {
  return normalizeToken(process.env.CRON_SECRET ?? "");
}

async function ping(path: string, timeoutMs = 12_000): Promise<PingResult> {
  const base = baseUrl();
  const secret = cronSecret();
  if (!base || !secret) return { ok: false, status: null, ms: 0, path };
  const started = Date.now();
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const resp = await fetch(`${base}${path}`, {
      method: "GET",
      headers: { authorization: `Bearer ${secret}` },
      cache: "no-store",
      signal: controller.signal,
    });
    return { ok: resp.ok, status: resp.status, ms: Date.now() - started, path };
  } catch {
    return { ok: false, status: null, ms: Date.now() - started, path };
  } finally {
    clearTimeout(t);
  }
}

function safeLog(event: string, payload: Record<string, unknown>) {
  // No secrets: only booleans/status/ms.
  console.log(`[worker] ${event}`, payload);
}

function start() {
  const base = baseUrl();
  const secret = cronSecret();
  safeLog("boot", {
    MP26_BASE_URL: Boolean(base),
    CRON_SECRET: Boolean(secret),
    node: process.version,
  });

  // Keepalive: every 15 minutes (staggered)
  const keepaliveMs = 15 * 60_000;
  setInterval(async () => {
    const r = await ping("/api/cron/keepalive");
    safeLog("keepalive", r);
  }, keepaliveMs);

  // Auto-blog scheduler: every 20 minutes (cadence enforcement happens server-side via last_auto_blog_at)
  const autoBlogMs = 20 * 60_000;
  setInterval(async () => {
    const r = await ping("/api/cron/auto-blog");
    safeLog("auto_blog", r);
  }, autoBlogMs);

  // Initial warm start (small delay so Railway logs are readable)
  setTimeout(async () => {
    const a = await ping("/api/cron/keepalive");
    safeLog("keepalive_initial", a);
    const b = await ping("/api/cron/auto-blog");
    safeLog("auto_blog_initial", b);
  }, 7_000);
}

start();

