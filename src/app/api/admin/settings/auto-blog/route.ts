import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth/admin";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { readJsonBodyWithLimit } from "@/lib/automation/readBody";

export const runtime = "nodejs";

function parseBool(v: unknown): boolean | null {
  if (typeof v === "boolean") return v;
  if (typeof v === "string") {
    const s = v.trim().toLowerCase();
    if (s === "true") return true;
    if (s === "false") return false;
  }
  return null;
}

function parseIntSafe(v: unknown): number | null {
  const n = typeof v === "number" ? v : typeof v === "string" ? Number(v) : NaN;
  if (!Number.isFinite(n)) return null;
  return Math.floor(n);
}

async function getSetting(sb: any, key: string): Promise<string | null> {
  const { data } = await sb.from("app_settings").select("value").eq("key", key).maybeSingle();
  return data && typeof data.value === "string" ? String(data.value) : null;
}

export async function GET() {
  await requireAdmin();
  const admin = createSupabaseAdminClient();
  if (!admin) return NextResponse.json({ ok: false, error: "not_configured" }, { status: 503 });

  const enabledRaw = await getSetting(admin, "auto_blog_global_enabled");
  const hoursRaw = await getSetting(admin, "auto_blog_every_hours");

  const enabled = enabledRaw === null ? true : enabledRaw.trim().toLowerCase() !== "false";
  const every_hours = (() => {
    const n = parseIntSafe(hoursRaw);
    // Default: 3 publicaciones / 24h por candidato.
    if (!n || n < 1 || n > 24) return 8;
    return n;
  })();

  return NextResponse.json({ ok: true, enabled, every_hours });
}

export async function POST(req: Request) {
  await requireAdmin();
  const admin = createSupabaseAdminClient();
  if (!admin) return NextResponse.json({ ok: false, error: "not_configured" }, { status: 503 });

  const body = await readJsonBodyWithLimit(req);
  if (!body.ok) return NextResponse.json({ ok: false, error: body.error }, { status: 400 });
  if (!body.data || typeof body.data !== "object") return NextResponse.json({ ok: false, error: "invalid_body" }, { status: 400 });

  const b = body.data as Record<string, unknown>;
  const enabled = parseBool(b.enabled);
  const every_hours = parseIntSafe(b.every_hours);

  const now = new Date().toISOString();
  if (enabled !== null) {
    await admin.from("app_settings").upsert({ key: "auto_blog_global_enabled", value: enabled ? "true" : "false", updated_at: now });
  }
  if (every_hours !== null) {
    const clamped = Math.max(1, Math.min(24, every_hours));
    await admin.from("app_settings").upsert({ key: "auto_blog_every_hours", value: String(clamped), updated_at: now });
  }

  return NextResponse.json({ ok: true });
}

