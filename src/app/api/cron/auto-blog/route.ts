import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import crypto from "node:crypto";

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

function parseJitterMinutes(v: string | null): number {
  const n = v ? Number(v) : NaN;
  if (!Number.isFinite(n)) return 37; // default jitter window (minutes)
  const m = Math.floor(n);
  if (m < 0 || m > 180) return 37;
  return m;
}

function sha256Int(input: string): number {
  // deterministic 32-bit integer (no secrets)
  const hex = crypto.createHash("sha256").update(input).digest("hex");
  return parseInt(hex.slice(0, 8), 16) >>> 0;
}

function jitterMsFor(args: { candidateId: string; cycle: number; maxJitterMs: number }): number {
  if (args.maxJitterMs <= 0) return 0;
  const n = sha256Int(`${args.candidateId}|${args.cycle}|mp26_auto_blog`);
  return n % args.maxJitterMs;
}

export async function GET(req: Request) {
  if (!requireCronAuth(req)) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });

  const apiToken = normalizeToken(process.env.MP26_AUTOMATION_TOKEN ?? process.env.AUTOMATION_API_TOKEN);
  if (!apiToken) return NextResponse.json({ ok: false, error: "not_configured" }, { status: 503 });

  const admin = createSupabaseAdminClient();
  if (!admin) return NextResponse.json({ ok: false, error: "supabase_not_configured" }, { status: 503 });

  const enabled = parseEnabled(await getAppSetting(admin, "auto_blog_global_enabled"));
  const everyHours = parseEveryHours(await getAppSetting(admin, "auto_blog_every_hours"));
  const jitterMinutes = parseJitterMinutes(await getAppSetting(admin, "auto_blog_jitter_minutes"));
  if (!enabled) return NextResponse.json({ ok: true, enabled: false, skipped: true, reason: "global_off" });

  const now = Date.now();
  const periodMs = everyHours * 3_600_000;
  const maxJitterMs = jitterMinutes * 60_000;

  const { data: rows } = await admin
    .from("politicians")
    .select("id,auto_blog_enabled,auto_publish_enabled,last_auto_blog_at,created_at")
    .eq("auto_blog_enabled", true)
    .eq("auto_publish_enabled", true)
    .order("id", { ascending: true });

  const candidates = (rows ?? []) as Array<{ id: string; last_auto_blog_at: string | null; created_at?: string | null }>;
  const origin = new URL(req.url).origin;
  const target = `${origin}/api/automation/editorial-orchestrate`;

  const results: Array<{ candidate_id: string; triggered: boolean; reason: string; next_due_at?: string | null }> = [];

  // Anti-spam guardrail:
  // - We do NOT trigger everyone who is “due” in the same run.
  // - We pick a small batch each run, and due-ness is jittered deterministically per candidate+cycle.
  const runsPerHour = 3; // worker hits this endpoint every ~20 min
  const maxPerRun = Math.max(1, Math.ceil(candidates.length / Math.max(1, everyHours * runsPerHour)));

  const dueList = candidates
    .map((c) => {
      const lastMs = c.last_auto_blog_at ? Date.parse(c.last_auto_blog_at) : NaN;
      const lastSafe = Number.isFinite(lastMs)
        ? lastMs
        : (() => {
            // For new candidates, simulate a “spread” last-run so we don't burst.
            const created = c.created_at ? Date.parse(c.created_at) : NaN;
            const base = Number.isFinite(created) ? created : now - periodMs;
            const pseudo = base + (sha256Int(`${c.id}|mp26_seed`) % Math.max(1, periodMs));
            return Math.min(pseudo, now - 60_000);
          })();

      const cycle = Math.floor(lastSafe / Math.max(1, periodMs)) + 1;
      const jitterMs = jitterMsFor({ candidateId: c.id, cycle, maxJitterMs });
      const nextDueMs = lastSafe + periodMs + jitterMs;
      return { id: c.id, nextDueMs };
    })
    .filter((x) => now >= x.nextDueMs)
    .sort((a, b) => a.nextDueMs - b.nextDueMs);

  const toTrigger = dueList.slice(0, maxPerRun);
  const triggerSet = new Set(toTrigger.map((x) => x.id));

  for (const c of candidates) {
    const dueMeta = dueList.find((d) => d.id === c.id) ?? null;
    const nextDueAt = dueMeta ? new Date(dueMeta.nextDueMs).toISOString() : null;

    if (!triggerSet.has(c.id)) {
      results.push({ candidate_id: c.id, triggered: false, reason: dueMeta ? "due_but_deferred" : "not_due", next_due_at: nextDueAt });
      continue;
    }

    // Create TWO lines in order:
    // (1) noticia grave / alto impacto cívico
    // (2) noticia viral / conversación pública
    // IMPORTANT: run viral first so "grave" becomes the newest item (top of public feed).
    let ok = true;
    for (const news_mode of ["viral", "grave"] as const) {
      // eslint-disable-next-line no-await-in-loop
      const resp = await fetch(target, {
        method: "POST",
        headers: { "content-type": "application/json", "x-automation-token": apiToken },
        body: JSON.stringify({
          candidate_id: c.id,
          max_items: 1,
          news_mode,
          editorial_style: "noticiero_portada",
          editorial_inclination: "informativo",
        }),
        cache: "no-store",
      });
      if (!resp.ok) ok = false;
    }

    if (!ok) {
      results.push({ candidate_id: c.id, triggered: false, reason: "engine_failed", next_due_at: nextDueAt });
      continue;
    }

    const at = new Date().toISOString();
    // eslint-disable-next-line no-await-in-loop
    await admin.from("politicians").update({ last_auto_blog_at: at, updated_at: at }).eq("id", c.id);
    results.push({ candidate_id: c.id, triggered: true, reason: "triggered", next_due_at: nextDueAt });
  }

  const triggered_count = results.filter((r) => r.triggered).length;
  return NextResponse.json({
    ok: true,
    enabled: true,
    every_hours: everyHours,
    jitter_minutes: jitterMinutes,
    max_per_run: maxPerRun,
    due_count: dueList.length,
    triggered_count,
    results,
  });
}

