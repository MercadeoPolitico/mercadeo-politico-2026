import { NextResponse } from "next/server";
import { isAdminSession } from "@/lib/auth/adminSession";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { readJsonBodyWithLimit } from "@/lib/automation/readBody";

export const runtime = "nodejs";

function isNonEmptyString(v: unknown): v is string {
  return typeof v === "string" && v.trim().length > 0;
}

async function optimizeImageToWebpSquare(input: Buffer): Promise<{ bytes: Buffer; contentType: string; ext: string }> {
  try {
    const mod = await import("sharp");
    const sharp = (mod as any).default ?? (mod as any);
    const out = await sharp(input)
      .rotate()
      .resize(1024, 1024, { fit: "cover", position: "attention" })
      .webp({ quality: 84 })
      .toBuffer();
    return { bytes: out, contentType: "image/webp", ext: "webp" };
  } catch {
    return { bytes: input, contentType: "application/octet-stream", ext: "bin" };
  }
}

function extractSupabasePublicObjectKey(args: { url: string; bucket: string }): string | null {
  try {
    const u = new URL(args.url);
    const marker = `/storage/v1/object/public/${encodeURIComponent(args.bucket)}/`;
    const idx = u.pathname.indexOf(marker);
    if (idx < 0) return null;
    const key = u.pathname.slice(idx + marker.length);
    return key ? decodeURIComponent(key) : null;
  } catch {
    return null;
  }
}

export async function POST(req: Request) {
  if (!(await isAdminSession())) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const admin = createSupabaseAdminClient();
  if (!admin) return NextResponse.json({ error: "supabase_not_configured" }, { status: 503 });

  const form = await req.formData().catch(() => null);
  if (!form) return NextResponse.json({ error: "invalid_form" }, { status: 400 });
  const draft_id = isNonEmptyString(form.get("draft_id")) ? String(form.get("draft_id")).trim() : "";
  const file = form.get("file");
  if (!draft_id) return NextResponse.json({ error: "draft_id_required" }, { status: 400 });
  if (!(file instanceof File)) return NextResponse.json({ error: "file_required" }, { status: 400 });
  if (!file.type || !String(file.type).toLowerCase().startsWith("image/")) return NextResponse.json({ error: "not_image" }, { status: 415 });
  if (file.size > 10_000_000) return NextResponse.json({ error: "file_too_large" }, { status: 413 });

  const { data: draft } = await admin.from("ai_drafts").select("id,candidate_id,metadata").eq("id", draft_id).maybeSingle();
  if (!draft) return NextResponse.json({ error: "not_found" }, { status: 404 });

  const raw = Buffer.from(await file.arrayBuffer());
  const opt = await optimizeImageToWebpSquare(raw);
  const candidateId = String((draft as any).candidate_id);
  const stamp = Date.now();
  const path = `${candidateId}/draft-images/${draft_id}-${stamp}.${opt.ext}`;

  const up = await admin.storage.from("politician-media").upload(path, opt.bytes, {
    upsert: false,
    cacheControl: "3600",
    contentType: opt.contentType,
  });
  if (up.error) return NextResponse.json({ error: "upload_failed" }, { status: 400 });

  const { data: pub } = admin.storage.from("politician-media").getPublicUrl(path);
  const publicUrl = pub?.publicUrl;
  if (typeof publicUrl !== "string" || !publicUrl.startsWith("http")) return NextResponse.json({ error: "public_url_failed" }, { status: 500 });

  const prevMeta = (draft as any)?.metadata && typeof (draft as any).metadata === "object" ? ((draft as any).metadata as Record<string, unknown>) : {};
  const nextMeta: Record<string, unknown> = {
    ...prevMeta,
    image_ready: true,
    image_url: publicUrl,
    image_metadata: {
      provider: "admin_upload",
      generated_at: new Date().toISOString(),
      original_filename: String(file.name || "").slice(0, 180),
    },
    media: {
      type: "image",
      image_url: publicUrl,
      page_url: null,
      license_short: "first_party_upload",
      attribution: "Imagen subida por administrador (first-party) · MarketBrain Technology™.",
      author: null,
      source: "first_party_upload",
    },
  };

  await admin.from("ai_drafts").update({ metadata: nextMeta, status: "edited", updated_at: new Date().toISOString() } as any).eq("id", draft_id);

  return NextResponse.json({ ok: true, url: publicUrl });
}

export async function DELETE(req: Request) {
  if (!(await isAdminSession())) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const admin = createSupabaseAdminClient();
  if (!admin) return NextResponse.json({ error: "supabase_not_configured" }, { status: 503 });

  const body = await readJsonBodyWithLimit(req);
  if (!body.ok) return NextResponse.json({ error: body.error }, { status: 400 });
  if (!body.data || typeof body.data !== "object") return NextResponse.json({ error: "invalid_body" }, { status: 400 });
  const b = body.data as Record<string, unknown>;
  const draft_id = isNonEmptyString(b.draft_id) ? b.draft_id.trim() : "";
  if (!draft_id) return NextResponse.json({ error: "draft_id_required" }, { status: 400 });

  const { data: draft } = await admin.from("ai_drafts").select("id,candidate_id,metadata").eq("id", draft_id).maybeSingle();
  if (!draft) return NextResponse.json({ error: "not_found" }, { status: 404 });

  const meta = ((draft as any).metadata && typeof (draft as any).metadata === "object" ? ((draft as any).metadata as Record<string, unknown>) : {}) as Record<
    string,
    unknown
  >;

  const existingUrl =
    (typeof meta.image_url === "string" && meta.image_url.trim()) ||
    (meta.media && typeof meta.media === "object" && typeof (meta.media as any).image_url === "string" ? String((meta.media as any).image_url).trim() : "") ||
    "";

  // Best-effort delete if the image is in our Supabase public bucket.
  if (existingUrl) {
    const key = extractSupabasePublicObjectKey({ url: existingUrl, bucket: "politician-media" });
    if (key) {
      try {
        await admin.storage.from("politician-media").remove([key]);
      } catch {
        // ignore
      }
    }
  }

  const nextMeta = { ...meta };
  delete (nextMeta as any).image_ready;
  delete (nextMeta as any).image_url;
  delete (nextMeta as any).image_metadata;
  delete (nextMeta as any).image_provider_attempts;
  delete (nextMeta as any).image_last_attempt_at;
  delete (nextMeta as any).image_last_error;
  delete (nextMeta as any).image_request_id;
  if ((nextMeta as any).media && typeof (nextMeta as any).media === "object") {
    // Only remove the media block if it looks like an image.
    const t = String((nextMeta as any).media.type ?? "").toLowerCase();
    if (!t || t === "image") delete (nextMeta as any).media;
  }

  await admin.from("ai_drafts").update({ metadata: nextMeta, status: "edited", updated_at: new Date().toISOString() } as any).eq("id", draft_id);
  return NextResponse.json({ ok: true });
}

