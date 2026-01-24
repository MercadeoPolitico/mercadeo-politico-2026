import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";

function normalizeToken(v: unknown): string {
  const s = String(v ?? "").trim();
  if (!s) return "";
  if ((s.startsWith('"') && s.endsWith('"')) || (s.startsWith("'") && s.endsWith("'"))) return s.slice(1, -1).trim();
  return s.endsWith("\\n") ? s.slice(0, -2).trim() : s;
}

function requireCronAuth(req: Request): boolean {
  const secret = normalizeToken(process.env.CRON_SECRET);
  if (!secret) return false;
  const auth = normalizeToken(req.headers.get("authorization") ?? "");
  return auth === `Bearer ${secret}`;
}

async function getAppSetting(admin: any, key: string): Promise<string | null> {
  const { data } = await admin.from("app_settings").select("value").eq("key", key).maybeSingle();
  return data && typeof data.value === "string" ? String(data.value) : null;
}

function parseEnabled(v: string | null): boolean {
  if (v === null) return true; // default ON
  return v.trim().toLowerCase() !== "false";
}

function parseEveryHours(v: string | null): number {
  const n = v ? Number(v) : NaN;
  if (!Number.isFinite(n)) return 4;
  const h = Math.floor(n);
  if (h < 1 || h > 24) return 4;
  return h;
}

export async function GET(req: Request) {
  if (!requireCronAuth(req)) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });

  const apiToken = normalizeToken(process.env.MP26_AUTOMATION_TOKEN ?? process.env.AUTOMATION_API_TOKEN);
  if (!apiToken) return NextResponse.json({ ok: false, error: "not_configured" }, { status: 503 });

  const admin = createSupabaseAdminClient();
  if (!admin) return NextResponse.json({ ok: false, error: "supabase_not_configured" }, { status: 503 });

  const enabled = parseEnabled(await getAppSetting(admin, "auto_blog_global_enabled"));
  const everyHours = parseEveryHours(await getAppSetting(admin, "auto_blog_every_hours"));
  if (!enabled) return NextResponse.json({ ok: true, enabled: false, skipped: true, reason: "global_off" });

  const now = Date.now();
  const cutoff = now - everyHours * 3_600_000;

  const { data: rows } = await admin
    .from("politicians")
    .select("id,auto_blog_enabled,auto_publish_enabled,last_auto_blog_at")
    .eq("auto_blog_enabled", true)
    .eq("auto_publish_enabled", true)
    .order("id", { ascending: true });

  const candidates = (rows ?? []) as Array<{ id: string; last_auto_blog_at: string | null }>;
  const origin = new URL(req.url).origin;
  const target = `${origin}/api/automation/editorial-orchestrate`;

  const results: Array<{ candidate_id: string; triggered: boolean; reason: string }> = [];

  for (const c of candidates) {
    const last = c.last_auto_blog_at ? Date.parse(c.last_auto_blog_at) : NaN;
    const due = !Number.isFinite(last) || last <= cutoff;
    if (!due) {
      results.push({ candidate_id: c.id, triggered: false, reason: "not_due" });
      // eslint-disable-next-line no-continue
      continue;
    }

    // eslint-disable-next-line no-await-in-loop
    const resp = await fetch(target, {
      method: "POST",
      headers: { "content-type": "application/json", "x-automation-token": apiToken },
      body: JSON.stringify({ candidate_id: c.id, max_items: 1, editorial_style: "noticiero_portada", editorial_inclination: "persuasivo_suave" }),
      cache: "no-store",
    });

    if (!resp.ok) {
      results.push({ candidate_id: c.id, triggered: false, reason: "engine_failed" });
      // eslint-disable-next-line no-continue
      continue;
    }

    const at = new Date().toISOString();
    // eslint-disable-next-line no-await-in-loop
    await admin.from("politicians").update({ last_auto_blog_at: at, updated_at: at }).eq("id", c.id);
    results.push({ candidate_id: c.id, triggered: true, reason: "triggered" });
  }

  const triggered_count = results.filter((r) => r.triggered).length;
  return NextResponse.json({ ok: true, enabled: true, every_hours: everyHours, triggered_count, results });
}

