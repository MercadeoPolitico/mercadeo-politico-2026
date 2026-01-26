import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth/admin";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { readJsonBodyWithLimit } from "@/lib/automation/readBody";

export const runtime = "nodejs";

function isNonEmptyString(v: unknown): v is string {
  return typeof v === "string" && v.trim().length > 0;
}

function isUrl(v: string): boolean {
  try {
    const u = new URL(v);
    return u.protocol === "http:" || u.protocol === "https:";
  } catch {
    return false;
  }
}

function normalizePlatform(v: string): string {
  return v.trim().toLowerCase();
}

export async function GET(req: Request) {
  await requireAdmin();
  const admin = createSupabaseAdminClient();
  if (!admin) return NextResponse.json({ error: "not_configured" }, { status: 503 });

  const { searchParams } = new URL(req.url);
  const politician_id = (searchParams.get("politician_id") ?? "").trim();
  if (!politician_id) return NextResponse.json({ error: "politician_id_required" }, { status: 400 });

  const { data, error } = await admin
    .from("politician_social_links")
    .select("id,platform,handle,url,status,created_at")
    .eq("politician_id", politician_id)
    .order("created_at", { ascending: true });

  if (error) return NextResponse.json({ error: "db_error" }, { status: 500 });
  return NextResponse.json({ ok: true, links: data ?? [] });
}

export async function POST(req: Request) {
  await requireAdmin();
  const admin = createSupabaseAdminClient();
  if (!admin) return NextResponse.json({ error: "not_configured" }, { status: 503 });

  const body = await readJsonBodyWithLimit(req);
  if (!body.ok) return NextResponse.json({ error: body.error }, { status: 400 });
  if (!body.data || typeof body.data !== "object") return NextResponse.json({ error: "invalid_body" }, { status: 400 });

  const b = body.data as Record<string, unknown>;
  const politician_id = isNonEmptyString(b.politician_id) ? b.politician_id.trim() : "";
  const platform = isNonEmptyString(b.platform) ? normalizePlatform(b.platform) : "";
  const handle = typeof b.handle === "string" && b.handle.trim().length ? b.handle.trim() : null;
  const url = isNonEmptyString(b.url) ? b.url.trim() : "";

  if (!politician_id) return NextResponse.json({ error: "politician_id_required" }, { status: 400 });
  if (!platform) return NextResponse.json({ error: "platform_required" }, { status: 400 });
  if (!url || !isUrl(url)) return NextResponse.json({ error: "invalid_url" }, { status: 400 });

  const { data, error } = await admin
    .from("politician_social_links")
    .insert({ politician_id, platform, handle, url, status: "active" })
    .select("id,platform,handle,url,status,created_at")
    .maybeSingle();

  if (error) return NextResponse.json({ error: "insert_failed" }, { status: 400 });
  return NextResponse.json({ ok: true, link: data ?? null });
}

export async function PATCH(req: Request) {
  await requireAdmin();
  const admin = createSupabaseAdminClient();
  if (!admin) return NextResponse.json({ error: "not_configured" }, { status: 503 });

  const body = await readJsonBodyWithLimit(req);
  if (!body.ok) return NextResponse.json({ error: body.error }, { status: 400 });
  if (!body.data || typeof body.data !== "object") return NextResponse.json({ error: "invalid_body" }, { status: 400 });

  const b = body.data as Record<string, unknown>;
  const id = isNonEmptyString(b.id) ? b.id.trim() : "";
  const status = isNonEmptyString(b.status) ? b.status.trim().toLowerCase() : "";
  if (!id) return NextResponse.json({ error: "id_required" }, { status: 400 });
  if (status !== "active" && status !== "inactive") return NextResponse.json({ error: "invalid_status" }, { status: 400 });

  const { error } = await admin.from("politician_social_links").update({ status }).eq("id", id);
  if (error) return NextResponse.json({ error: "update_failed" }, { status: 400 });
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: Request) {
  await requireAdmin();
  const admin = createSupabaseAdminClient();
  if (!admin) return NextResponse.json({ error: "not_configured" }, { status: 503 });

  const body = await readJsonBodyWithLimit(req);
  if (!body.ok) return NextResponse.json({ error: body.error }, { status: 400 });
  if (!body.data || typeof body.data !== "object") return NextResponse.json({ error: "invalid_body" }, { status: 400 });

  const b = body.data as Record<string, unknown>;
  const id = isNonEmptyString(b.id) ? b.id.trim() : "";
  if (!id) return NextResponse.json({ error: "id_required" }, { status: 400 });

  const { error } = await admin.from("politician_social_links").delete().eq("id", id);
  if (error) return NextResponse.json({ error: "delete_failed" }, { status: 400 });
  return NextResponse.json({ ok: true });
}

