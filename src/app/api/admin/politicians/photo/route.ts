import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { readJsonBodyWithLimit } from "@/lib/automation/readBody";

export const runtime = "nodejs";

function isNonEmptyString(v: unknown): v is string {
  return typeof v === "string" && v.trim().length > 0;
}

function profilePathFor(politicianId: string): string {
  // Deterministic path used by public pages (no DB column needed).
  // We intentionally omit extension so the URL is stable across uploads.
  return `${politicianId}/profile/profile`;
}

export async function POST(req: Request) {
  await requireAdmin();
  const supabase = await createSupabaseServerClient();
  if (!supabase) return NextResponse.json({ error: "not_configured" }, { status: 503 });

  const form = await req.formData().catch(() => null);
  if (!form) return NextResponse.json({ error: "invalid_form" }, { status: 400 });
  const politician_id = isNonEmptyString(form.get("politician_id")) ? String(form.get("politician_id")).trim() : "";
  const file = form.get("file");
  if (!politician_id) return NextResponse.json({ error: "politician_id_required" }, { status: 400 });
  if (!(file instanceof File)) return NextResponse.json({ error: "file_required" }, { status: 400 });

  // Basic constraints (prevent accidental huge uploads)
  if (file.size > 8_500_000) return NextResponse.json({ error: "file_too_large" }, { status: 413 });
  if (!file.type || !file.type.toLowerCase().startsWith("image/")) return NextResponse.json({ error: "not_image" }, { status: 415 });

  // Normalize/optimize: store a square WebP for fast PWA loading.
  const raw = new Uint8Array(await file.arrayBuffer());
  let bytes: Uint8Array = raw;
  let contentType = file.type;
  try {
    const mod = await import("sharp");
    const sharp = (mod as any).default ?? (mod as any);
    const out = await sharp(Buffer.from(raw))
      .rotate()
      .resize(512, 512, { fit: "cover", position: "attention" })
      .webp({ quality: 84 })
      .toBuffer();
    bytes = new Uint8Array(out);
    contentType = "image/webp";
  } catch {
    // If sharp isn't available, keep original bytes/type.
  }

  // Deterministic path (overwrite).
  const path = profilePathFor(politician_id);
  const { error: upErr } = await supabase.storage.from("politician-media").upload(path, bytes, {
    upsert: true,
    cacheControl: "3600",
    contentType,
  });
  if (upErr) return NextResponse.json({ error: "upload_failed" }, { status: 400 });

  const { data } = supabase.storage.from("politician-media").getPublicUrl(path);
  const url = data?.publicUrl;
  if (!url || typeof url !== "string") return NextResponse.json({ error: "public_url_failed" }, { status: 500 });

  // Touch politician updated_at so pages can bust caches (best-effort).
  await supabase.from("politicians").update({ updated_at: new Date().toISOString() }).eq("id", politician_id);

  return NextResponse.json({ ok: true, url });
}

export async function DELETE(req: Request) {
  await requireAdmin();
  const supabase = await createSupabaseServerClient();
  if (!supabase) return NextResponse.json({ error: "not_configured" }, { status: 503 });

  const body = await readJsonBodyWithLimit(req);
  if (!body.ok) return NextResponse.json({ error: body.error }, { status: 400 });
  if (!body.data || typeof body.data !== "object") return NextResponse.json({ error: "invalid_body" }, { status: 400 });
  const b = body.data as Record<string, unknown>;
  const politician_id = isNonEmptyString(b.politician_id) ? b.politician_id.trim() : "";
  if (!politician_id) return NextResponse.json({ error: "politician_id_required" }, { status: 400 });

  await supabase.storage.from("politician-media").remove([profilePathFor(politician_id)]);
  await supabase.from("politicians").update({ updated_at: new Date().toISOString() }).eq("id", politician_id);
  return NextResponse.json({ ok: true });
}

