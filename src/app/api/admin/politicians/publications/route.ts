import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth/admin";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { readJsonBodyWithLimit } from "@/lib/automation/readBody";
import { ensureSocialVariants } from "@/lib/automation/socialVariants";

export const runtime = "nodejs";

function isNonEmptyString(v: unknown): v is string {
  return typeof v === "string" && v.trim().length > 0;
}

function clampArrayOfStrings(v: unknown, max: number): string[] | null {
  if (!Array.isArray(v)) return null;
  const out = v
    .filter((x) => typeof x === "string")
    .map((s) => s.trim())
    .filter(Boolean)
    .slice(0, max);
  return out.length ? out : null;
}

function parseIsoDateOrNull(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const t = v.trim();
  if (!t) return null;
  const d = new Date(t);
  if (!Number.isFinite(d.getTime())) return null;
  return d.toISOString();
}

export async function GET(req: Request) {
  await requireAdmin();
  const admin = createSupabaseAdminClient();
  if (!admin) return NextResponse.json({ error: "not_configured" }, { status: 503 });

  const { searchParams } = new URL(req.url);
  const politician_id = (searchParams.get("politician_id") ?? "").trim();
  if (!politician_id) return NextResponse.json({ error: "politician_id_required" }, { status: 400 });

  const { data, error } = await admin
    .from("politician_publications")
    .select("id,platform,title,content,variants,media_urls,status,rotation_window_days,expires_at,created_at,updated_at,decided_at,decision_notes")
    .eq("politician_id", politician_id)
    .order("created_at", { ascending: false })
    .limit(100);

  if (error) return NextResponse.json({ error: "db_error" }, { status: 500 });
  return NextResponse.json({ ok: true, publications: data ?? [] });
}

export async function POST(req: Request) {
  const { user } = await requireAdmin();
  const admin = createSupabaseAdminClient();
  if (!admin) return NextResponse.json({ error: "not_configured" }, { status: 503 });

  const body = await readJsonBodyWithLimit(req);
  if (!body.ok) return NextResponse.json({ error: body.error }, { status: 400 });
  if (!body.data || typeof body.data !== "object") return NextResponse.json({ error: "invalid_body" }, { status: 400 });

  const b = body.data as Record<string, unknown>;
  const politician_id = isNonEmptyString(b.politician_id) ? b.politician_id.trim() : "";
  const platform = isNonEmptyString(b.platform) ? b.platform.trim().toLowerCase() : "multi";
  const title = typeof b.title === "string" && b.title.trim().length ? b.title.trim().slice(0, 200) : null;
  const content = isNonEmptyString(b.content) ? b.content.trim() : "";
  const media_urls = clampArrayOfStrings(b.media_urls, 12);
  const rotation_window_days =
    typeof b.rotation_window_days === "number" && Number.isFinite(b.rotation_window_days) ? b.rotation_window_days : null;
  const expires_at = parseIsoDateOrNull(b.expires_at);

  if (!politician_id) return NextResponse.json({ error: "politician_id_required" }, { status: 400 });
  if (!content) return NextResponse.json({ error: "content_required" }, { status: 400 });

  // Enrich variants server-side so the admin UI always gets populated values.
  // Keep select minimal to avoid schema drift issues.
  const { data: pol } = await admin.from("politicians").select("name,ballot_number").eq("id", politician_id).maybeSingle();
  const variantsInput = (b.variants && typeof b.variants === "object" ? (b.variants as any) : null) as any;
  const computed = ensureSocialVariants({
    baseText: content,
    blogText: content,
    variants: variantsInput,
    seo_keywords: [],
    candidate: { name: (pol as any)?.name ?? null, ballot_number: (pol as any)?.ballot_number ?? null },
  });

  const now = new Date().toISOString();
  const { data: inserted, error } = await admin
    .from("politician_publications")
    .insert({
      politician_id,
      platform,
      title,
      content,
      variants: computed,
      media_urls,
      status: "pending_approval",
      created_by: user.id,
      rotation_window_days,
      expires_at,
      updated_at: now,
    } as any)
    .select("id")
    .maybeSingle();

  if (error) return NextResponse.json({ error: "insert_failed" }, { status: 400 });
  return NextResponse.json({ ok: true, id: inserted?.id ?? null });
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
  if (!id) return NextResponse.json({ error: "id_required" }, { status: 400 });

  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (typeof b.title === "string") patch.title = b.title.trim() ? b.title.trim().slice(0, 200) : null;
  if (typeof b.content === "string") patch.content = b.content;
  if (b.variants && typeof b.variants === "object") patch.variants = b.variants;
  if (Array.isArray(b.media_urls)) patch.media_urls = clampArrayOfStrings(b.media_urls, 12);
  if (typeof b.status === "string" && b.status.trim()) patch.status = b.status.trim();

  const { error } = await admin.from("politician_publications").update(patch).eq("id", id);
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

  const { error } = await admin.from("politician_publications").delete().eq("id", id);
  if (error) return NextResponse.json({ error: "delete_failed" }, { status: 400 });
  return NextResponse.json({ ok: true });
}

