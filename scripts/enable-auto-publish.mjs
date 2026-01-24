/**
 * Enable auto_publish_enabled for candidates (safe).
 *
 * - Uses Supabase Service Role (SUPABASE_SERVICE_ROLE_KEY) from .env.local
 * - Does NOT print any secret values
 * - Prints only counts
 */
import fs from "node:fs";
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

async function main() {
  const envLocal = fs.existsSync(".env.local") ? parseDotenv(fs.readFileSync(".env.local", "utf8")) : {};
  const url = (process.env.NEXT_PUBLIC_SUPABASE_URL || envLocal.NEXT_PUBLIC_SUPABASE_URL || "").trim();
  const key = (process.env.SUPABASE_SERVICE_ROLE_KEY || envLocal.SUPABASE_SERVICE_ROLE_KEY || "").trim();
  assert(url, "Missing NEXT_PUBLIC_SUPABASE_URL");
  assert(key, "Missing SUPABASE_SERVICE_ROLE_KEY");

  const supabase = createClient(url, key, { auth: { persistSession: false } });

  // Enable auto publish for all candidates that have auto-blog enabled.
  const { data, error } = await supabase
    .from("politicians")
    .update({ auto_publish_enabled: true })
    .eq("auto_blog_enabled", true)
    .select("id");

  if (error) throw new Error(`update_failed`);
  console.log("[enable-auto-publish] updated_count", Array.isArray(data) ? data.length : 0);
}

main().catch((e) => {
  console.error("[enable-auto-publish] FAILED", e?.message || String(e));
  process.exit(1);
});

