import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth/admin";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";

function isNonEmptyString(v: unknown): v is string {
  return typeof v === "string" && v.trim().length > 0;
}

function sanitizeFilename(name: string): string {
  const base = String(name || "")
    .normalize("NFKD")
    .replaceAll(/[^\w.\-]+/g, "-")
    .replaceAll(/-+/g, "-")
    .replaceAll(/^\-+|\-+$/g, "");
  return base.length ? base.slice(0, 120) : "file";
}

async function maybeOptimizeImageToWebp(input: Buffer): Promise<{ bytes: Buffer; contentType: string; ext: string }> {
  // Optional dependency: if sharp isn't installed, fall back to original bytes.
  try {
    const mod = await import("sharp");
    const sharp = (mod as any).default ?? (mod as any);
    const out = await sharp(input)
      .rotate() // respect EXIF orientation
      .resize(1024, 1024, { fit: "inside", withoutEnlargement: true })
      .webp({ quality: 82 })
      .toBuffer();
    return { bytes: out, contentType: "image/webp", ext: "webp" };
  } catch {
    return { bytes: input, contentType: "application/octet-stream", ext: "bin" };
  }
}

export async function GET(req: Request) {
  await requireAdmin();
  const admin = createSupabaseAdminClient();
  if (!admin) return NextResponse.json({ error: "not_configured" }, { status: 503 });

  const { searchParams } = new URL(req.url);
  const politician_id = (searchParams.get("politician_id") ?? "").trim();
  if (!politician_id) return NextResponse.json({ error: "politician_id_required" }, { status: 400 });

  const { data, error } = await admin.storage.from("politician-media").list(politician_id, {
    limit: 80,
    sortBy: { column: "created_at", order: "desc" },
  });
  if (error) return NextResponse.json({ error: "list_failed" }, { status: 400 });

  const files =
    (data ?? [])
      .filter((o) => o?.name && !String(o.name).endsWith("/"))
      .map((o) => {
        const p = `${politician_id}/${o.name}`;
        const { data: u } = admin.storage.from("politician-media").getPublicUrl(p);
        return { name: String(o.name), url: u.publicUrl };
      }) ?? [];

  return NextResponse.json({ ok: true, files });
}

export async function POST(req: Request) {
  await requireAdmin();
  const admin = createSupabaseAdminClient();
  if (!admin) return NextResponse.json({ error: "not_configured" }, { status: 503 });

  const form = await req.formData().catch(() => null);
  if (!form) return NextResponse.json({ error: "invalid_form" }, { status: 400 });

  const politician_id = isNonEmptyString(form.get("politician_id")) ? String(form.get("politician_id")).trim() : "";
  const file = form.get("file");
  if (!politician_id) return NextResponse.json({ error: "politician_id_required" }, { status: 400 });
  if (!(file instanceof File)) return NextResponse.json({ error: "file_required" }, { status: 400 });

  // Hard caps (keep server stable)
  if (file.size > 25_000_000) return NextResponse.json({ error: "file_too_large" }, { status: 413 });

  const mime = String(file.type || "").toLowerCase();
  const isImage = mime.startsWith("image/");
  const isVideo = mime.startsWith("video/");
  if (!isImage && !isVideo) return NextResponse.json({ error: "unsupported_type" }, { status: 415 });

  const raw = Buffer.from(await file.arrayBuffer());

  let bytes: Buffer = raw;
  let contentType = mime || "application/octet-stream";
  let ext = "";

  if (isImage) {
    const opt = await maybeOptimizeImageToWebp(raw);
    bytes = opt.bytes;
    // If sharp was not available, keep original content type.
    if (opt.ext === "webp") {
      contentType = opt.contentType;
      ext = "webp";
    } else {
      contentType = mime || "application/octet-stream";
      ext = "";
    }
  } else {
    // Video: keep original. Prefer mp4 for web, but don't transcode here.
    // If it's not mp4, still upload as-is (functional), but keep a safe extensionless path.
    ext = "";
  }

  const baseName = sanitizeFilename(file.name);
  const stamp = Date.now();
  const storageName = `${stamp}-${baseName}${ext ? `.${ext}` : ""}`;
  const storagePath = `${politician_id}/${storageName}`;

  const { error: upErr } = await admin.storage.from("politician-media").upload(storagePath, bytes, {
    upsert: false,
    cacheControl: "3600",
    contentType,
  });
  if (upErr) return NextResponse.json({ error: "upload_failed" }, { status: 400 });

  const { data } = admin.storage.from("politician-media").getPublicUrl(storagePath);
  return NextResponse.json({ ok: true, name: storageName, url: data.publicUrl });
}

