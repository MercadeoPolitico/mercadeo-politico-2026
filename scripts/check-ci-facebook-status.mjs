/**
 * Diagnóstico: últimas publicaciones del Centro Informativo y si se enviaron a Facebook.
 * No imprime secretos. Requiere Supabase en .env.local.
 * Uso: node scripts/check-ci-facebook-status.mjs
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

async function main() {
  const envLocal = fs.existsSync(".env.local") ? parseDotenv(fs.readFileSync(".env.local", "utf8")) : {};
  const url = (process.env.NEXT_PUBLIC_SUPABASE_URL || envLocal.NEXT_PUBLIC_SUPABASE_URL || "").trim();
  const key = (process.env.SUPABASE_SERVICE_ROLE_KEY || envLocal.SUPABASE_SERVICE_ROLE_KEY || "").trim();
  if (!url || !key) {
    console.log("[check-ci-facebook] Missing Supabase env (NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)");
    process.exit(1);
  }

  const sb = createClient(url, key, { auth: { persistSession: false } });
  const { data, error } = await sb
    .from("citizen_news_posts")
    .select("id,slug,candidate_id,title,published_at,facebook_post_id,facebook_published_at")
    .eq("status", "published")
    .order("published_at", { ascending: false })
    .limit(12);

  if (error) {
    console.error("[check-ci-facebook] query_failed", error.message);
    process.exit(1);
  }

  const posts = data ?? [];
  const withFb = posts.filter((p) => p.facebook_post_id);
  console.log("[check-ci-facebook] Published posts (last 12):", posts.length);
  console.log("[check-ci-facebook] With facebook_post_id (sent to FB):", withFb.length);
  if (posts.length === 0) {
    console.log("[check-ci-facebook] No published posts yet. Publish from Admin or wait for auto-blog cron.");
    return;
  }
  for (const p of posts.slice(0, 6)) {
    console.log("  -", p.slug, "|", p.published_at?.slice(0, 19), "| FB:", p.facebook_post_id ? p.facebook_post_id : "—");
  }
  if (withFb.length === 0) {
    console.log("[check-ci-facebook] None have facebook_post_id. Check: Vercel N8N_WEBHOOK_URL_CENTRO_FACEBOOK, n8n workflow active, FACEBOOK_CENTRO_PAGE_ID + TOKEN in n8n.");
  }
}

main().catch((e) => {
  console.error("[check-ci-facebook]", e?.message || e);
  process.exit(1);
});
