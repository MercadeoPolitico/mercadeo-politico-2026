/**
 * Upload profile photos for known candidates into Supabase Storage.
 *
 * - Uses SUPABASE_SERVICE_ROLE_KEY + NEXT_PUBLIC_SUPABASE_URL from .env.local (or process.env)
 * - Uploads to deterministic path: <candidate_id>/profile/profile
 * - Best-effort optimizes to a square WebP (512x512) when `sharp` is available.
 * - Does NOT print secrets
 */
import fs from "node:fs";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";

function parseDotenv(raw) {
  const env = {};
  for (const line of raw.split(/\r?\n/)) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const i = t.indexOf("=");
    if (i < 1) continue;
    const k = t.slice(0, i).trim();
    let v = t.slice(i + 1).trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
    if (v.endsWith("\\n")) v = v.slice(0, -2);
    env[k] = v;
  }
  return env;
}

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

function contentTypeFromExt(p) {
  const ext = path.extname(p).toLowerCase();
  if (ext === ".png") return "image/png";
  if (ext === ".jpg" || ext === ".jpeg") return "image/jpeg";
  if (ext === ".webp") return "image/webp";
  return "application/octet-stream";
}

async function maybeOptimizeToWebpSquare(buf) {
  try {
    const mod = await import("sharp");
    const sharp = mod.default ?? mod;
    const out = await sharp(buf).rotate().resize(512, 512, { fit: "cover", position: "attention" }).webp({ quality: 84 }).toBuffer();
    return { buf: out, contentType: "image/webp" };
  } catch {
    return { buf, contentType: null };
  }
}

async function uploadOne(sb, candidateId, filePath) {
  const raw = fs.readFileSync(filePath);
  const opt = await maybeOptimizeToWebpSquare(raw);
  const buf = opt.buf;
  const ct = opt.contentType || contentTypeFromExt(filePath);
  const storagePath = `${candidateId}/profile/profile`;
  const { error } = await sb.storage.from("politician-media").upload(storagePath, buf, {
    upsert: true,
    contentType: ct,
    cacheControl: "3600",
  });
  if (error) throw new Error(`upload_failed:${candidateId}`);
  const { data } = sb.storage.from("politician-media").getPublicUrl(storagePath);
  return data?.publicUrl ?? null;
}

async function main() {
  const envLocal = fs.existsSync(".env.local") ? parseDotenv(fs.readFileSync(".env.local", "utf8")) : {};
  const url = (process.env.NEXT_PUBLIC_SUPABASE_URL || envLocal.NEXT_PUBLIC_SUPABASE_URL || "").trim();
  const key = (process.env.SUPABASE_SERVICE_ROLE_KEY || envLocal.SUPABASE_SERVICE_ROLE_KEY || "").trim();
  assert(url, "Missing NEXT_PUBLIC_SUPABASE_URL");
  assert(key, "Missing SUPABASE_SERVICE_ROLE_KEY");

  const sb = createClient(url, key, { auth: { persistSession: false } });

  const jobs = [
    {
      id: "jose-angel-martinez",
      file:
        "C:\\Users\\jc1ga\\.cursor\\projects\\f-mercadeo-politico-2026\\assets\\c__Users_jc1ga_AppData_Roaming_Cursor_User_workspaceStorage_9774d72e6e497d1b00d81c2906957f6d_images_Jose_Angel_MArtinez-304c759c-cb8c-425e-a2d4-d57c8fcee55d.png",
    },
    {
      id: "eduardo-buitrago",
      file:
        "C:\\Users\\jc1ga\\.cursor\\projects\\f-mercadeo-politico-2026\\assets\\c__Users_jc1ga_AppData_Roaming_Cursor_User_workspaceStorage_9774d72e6e497d1b00d81c2906957f6d_images_Eduard_Buitrago-2d7e74e1-e6c1-49dd-a9e9-7692ccd631d1.png",
    },
  ];

  let ok = 0;
  for (const j of jobs) {
    const fp = path.resolve(j.file);
    if (!fs.existsSync(fp)) continue;
    // eslint-disable-next-line no-await-in-loop
    const publicUrl = await uploadOne(sb, j.id, fp);
    if (publicUrl) ok++;
  }

  console.log("[upload-profile-photos] done", { uploaded: ok, total: jobs.length });
}

main().catch((e) => {
  console.error("[upload-profile-photos] FAILED", e?.message || String(e));
  process.exit(1);
});

