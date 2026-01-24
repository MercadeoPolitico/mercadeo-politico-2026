/**
 * Print a safe summary of latest published citizen posts (no secrets).
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
  const { data, error } = await sb
    .from("citizen_news_posts")
    .select("id,slug,candidate_id,title,source_url,media_urls,published_at")
    .eq("status", "published")
    .order("published_at", { ascending: false })
    .limit(6);
  if (error) throw new Error("query_failed");

  for (const p of data ?? []) {
    const srcHost = typeof p.source_url === "string" ? hostOf(p.source_url) : null;
    const media = Array.isArray(p.media_urls) ? p.media_urls.filter((x) => typeof x === "string") : [];
    console.log("[post]", {
      candidate_id: p.candidate_id,
      slug: p.slug,
      has_media: Boolean(media.length),
      media_host: media.length ? hostOf(media[0]) : null,
      source_host: srcHost,
      published_at: p.published_at,
    });
  }
}

main().catch((e) => {
  console.error("[check-latest-citizen-posts] FAILED", e?.message || String(e));
  process.exit(1);
});

