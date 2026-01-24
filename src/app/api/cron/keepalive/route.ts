import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";

type HttpPing = { ok: boolean; status: number | null; ms: number; host: string };

function normalizeToken(v: unknown): string {
  const s = String(v ?? "").trim();
  if (!s) return "";
  if ((s.startsWith('"') && s.endsWith('"')) || (s.startsWith("'") && s.endsWith("'"))) return s.slice(1, -1).trim();
  return s.endsWith("\\n") ? s.slice(0, -2).trim() : s;
}

function allowCron(req: Request): boolean {
  // Vercel Cron supports Authorization: Bearer <CRON_SECRET>
  const cron = normalizeToken(process.env.CRON_SECRET);
  const auth = normalizeToken(req.headers.get("authorization") ?? "");
  if (cron && auth === `Bearer ${cron}`) return true;

  // Fallback for n8n/automation callers
  const apiToken = normalizeToken(process.env.MP26_AUTOMATION_TOKEN ?? process.env.AUTOMATION_API_TOKEN);
  const headerToken = normalizeToken(req.headers.get("x-automation-token") ?? "");
  if (apiToken && headerToken === apiToken) return true;

  return false;
}

function safeHost(url: string): string {
  try {
    return new URL(url).host;
  } catch {
    return "invalid-url";
  }
}

function parseKeepaliveUrls(): string[] {
  const urls: string[] = [];

  // Canonical: comma-separated list of URLs (public endpoints) to keep warm.
  const raw = String(process.env.KEEPALIVE_URLS ?? "").trim();
  if (raw) {
    for (const part of raw.split(",")) {
      const u = part.trim().replace(/\/+$/, "");
      if (u) urls.push(u);
    }
  }

  // Back-compat / defaults
  const n8n = String(process.env.N8N_INSTANCE_URL || process.env.N8N_URL || (process.env as any).n8n_URL || "").trim().replace(/\/+$/, "");
  if (n8n) urls.push(n8n);

  // Sensible default for this repo (safe public URL). Override via env in prod.
  if (!urls.length) urls.push("https://n8n-production-1504.up.railway.app");

  // De-dup
  return Array.from(new Set(urls));
}

async function pingHttp(url: string, timeoutMs = 8000): Promise<HttpPing> {
  const started = Date.now();
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const resp = await fetch(url, { method: "GET", cache: "no-store", signal: controller.signal });
    return { ok: resp.ok, status: resp.status, ms: Date.now() - started, host: safeHost(url) };
  } catch {
    return { ok: false, status: null, ms: Date.now() - started, host: safeHost(url) };
  } finally {
    clearTimeout(t);
  }
}

async function pingSupabase(): Promise<{ ok: boolean; error: string | null; ms: number }> {
  const started = Date.now();
  const admin = createSupabaseAdminClient();
  if (!admin) return { ok: false, error: "not_configured", ms: Date.now() - started };
  try {
    const { error } = await admin.from("politicians").select("id", { head: true, count: "exact" }).limit(1);
    if (error) return { ok: false, error: "db_error", ms: Date.now() - started };
    return { ok: true, error: null, ms: Date.now() - started };
  } catch {
    return { ok: false, error: "exception", ms: Date.now() - started };
  }
}

export async function GET(req: Request) {
  if (!allowCron(req)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const now = new Date().toISOString();
  const urls = parseKeepaliveUrls();
  const [sb, http] = await Promise.all([pingSupabase(), Promise.all(urls.map((u) => pingHttp(u)))]);

  return NextResponse.json({
    ok: true,
    at: now,
    services: {
      supabase: sb,
      http,
    },
  });
}

