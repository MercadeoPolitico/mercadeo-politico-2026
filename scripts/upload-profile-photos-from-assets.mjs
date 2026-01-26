/**
 * Upload profile photos for known candidates into Supabase Storage.
 *
 * - Uses SUPABASE_SERVICE_ROLE_KEY + NEXT_PUBLIC_SUPABASE_URL from .env.local (or process.env)
 * - Uploads to deterministic path: <candidate_id>/profile/profile
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

async function uploadOne(sb, candidateId, filePath) {
  const buf = fs.readFileSync(filePath);
  const ct = contentTypeFromExt(filePath);
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
        "C:\\Users\\jc1ga\\.cursor\\projects\\f-mercadeo-politico-2026\\assets\\c__Users_jc1ga_AppData_Roaming_Cursor_User_workspaceStorage_9774d72e6e497d1b00d81c2906957f6d_images_237eff3e-2ea8-4cc9-88e7-997cfa2bd923-12be20b0-ab82-4bc0-941c-b72182b999d8.png",
    },
    {
      id: "eduardo-buitrago",
      file:
        "C:\\Users\\jc1ga\\.cursor\\projects\\f-mercadeo-politico-2026\\assets\\c__Users_jc1ga_AppData_Roaming_Cursor_User_workspaceStorage_9774d72e6e497d1b00d81c2906957f6d_images_91048e0c-38f9-4d26-9a18-a3317998adbc-f82f90a2-e09c-4494-b935-733515153123.png",
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

