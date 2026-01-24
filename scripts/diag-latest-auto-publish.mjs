/**
 * Diagnose latest auto-publish: draft metadata.media vs citizen_news_posts.media_urls
 * Safe: prints no secrets, only slugs and booleans/hosts.
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

function hostOf(u) {
  try {
    return new URL(u).host;
  } catch {
    return null;
  }
}

async function main() {
  const envLocal = fs.existsSync(".env.local") ? parseDotenv(fs.readFileSync(".env.local", "utf8")) : {};
  const url = (process.env.NEXT_PUBLIC_SUPABASE_URL || envLocal.NEXT_PUBLIC_SUPABASE_URL || "").trim();
  const key = (process.env.SUPABASE_SERVICE_ROLE_KEY || envLocal.SUPABASE_SERVICE_ROLE_KEY || "").trim();
  assert(url, "Missing NEXT_PUBLIC_SUPABASE_URL");
  assert(key, "Missing SUPABASE_SERVICE_ROLE_KEY");
  const sb = createClient(url, key, { auth: { persistSession: false } });

  const { data: drafts, error } = await sb
    .from("ai_drafts")
    .select("id,candidate_id,created_at,metadata")
    .order("created_at", { ascending: false })
    .limit(8);
  if (error) throw new Error("drafts_query_failed");

  for (const d of drafts ?? []) {
    const meta = d.metadata && typeof d.metadata === "object" ? d.metadata : null;
    const media = meta?.media && typeof meta.media === "object" ? meta.media : null;
    const img = typeof media?.image_url === "string" ? media.image_url : null;
    const slug = typeof meta?.published_slug === "string" ? meta.published_slug : null;
    const post = slug
      ? await sb.from("citizen_news_posts").select("slug,media_urls,source_url,published_at").eq("slug", slug).maybeSingle()
      : { data: null };
    const mediaUrls = Array.isArray(post.data?.media_urls) ? post.data.media_urls : null;

    console.log("[draft]", {
      candidate_id: d.candidate_id,
      published_slug: slug,
      meta_has_image: Boolean(img),
      meta_image_host: img && img.startsWith("http") ? hostOf(img) : img ? "data" : null,
      post_found: Boolean(post.data?.slug),
      post_has_media: Boolean(mediaUrls?.length),
      post_media_host: mediaUrls?.length ? hostOf(mediaUrls[0]) : null,
      post_source_host: typeof post.data?.source_url === "string" ? hostOf(post.data.source_url) : null,
      created_at: d.created_at,
    });
  }
}

main().catch((e) => {
  console.error("[diag-latest-auto-publish] FAILED", e?.message || String(e));
  process.exit(1);
});

