/**
 * Report Centro Informativo posts by region and by politician (images: has_image, placeholder).
 * Safe: does not print secrets or full article text.
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

function isPlaceholder(u) {
  const s = String(u || "").trim();
  return s.includes("/fallback/news.svg") || s.includes("news-fallback");
}

async function main() {
  const envLocal = fs.existsSync(".env.local") ? parseDotenv(fs.readFileSync(".env.local", "utf8")) : {};
  const url = (process.env.NEXT_PUBLIC_SUPABASE_URL || envLocal.NEXT_PUBLIC_SUPABASE_URL || "").trim();
  const key = (process.env.SUPABASE_SERVICE_ROLE_KEY || envLocal.SUPABASE_SERVICE_ROLE_KEY || "").trim();
  assert(url, "Missing NEXT_PUBLIC_SUPABASE_URL");
  assert(key, "Missing SUPABASE_SERVICE_ROLE_KEY");

  const sb = createClient(url, key, { auth: { persistSession: false } });

  const { data: pols, error: polErr } = await sb
    .from("politicians")
    .select("id,name,region,office")
    .order("id", { ascending: true });
  if (polErr) throw new Error("politicians_query_failed");
  const politicians = Array.isArray(pols) ? pols : [];
  const polById = new Map(politicians.map((p) => [String(p.id), p]));

  const { data: posts, error: postErr } = await sb
    .from("citizen_news_posts")
    .select("id,candidate_id,slug,media_urls,published_at")
    .eq("status", "published")
    .order("published_at", { ascending: false })
    .limit(5000);
  if (postErr) throw new Error("posts_query_failed");
  const rows = Array.isArray(posts) ? posts : [];

  const byPolitician = new Map();
  const byRegion = new Map();

  for (const p of politicians) {
    const id = String(p.id);
    const region = String(p.region || "").trim() || "(sin región)";
    byPolitician.set(id, { candidate_id: id, name: String(p.name || ""), region, posts: 0, with_image: 0, placeholder: 0 });
    if (!byRegion.has(region)) byRegion.set(region, { region, posts: 0, with_image: 0, placeholder: 0 });
  }

  for (const post of rows) {
    const cid = String(post.candidate_id);
    const pol = byPolitician.get(cid);
    const regionKey = pol ? pol.region : "(sin región)";
    const reg = byRegion.get(regionKey) || byRegion.get("(sin región)");
    if (pol) {
      pol.posts++;
      if (reg) {
        reg.posts++;
      }
    }
    const arr = Array.isArray(post.media_urls) ? post.media_urls.filter((x) => typeof x === "string") : [];
    const u0 = arr[0] ? String(arr[0]).trim() : "";
    if (u0) {
      if (pol) pol.with_image++;
      if (reg) reg.with_image++;
      if (isPlaceholder(u0)) {
        if (pol) pol.placeholder++;
        if (reg) reg.placeholder++;
      }
    }
  }

  console.log("[report-ci] by_politician");
  for (const [, v] of byPolitician) {
    console.log("  ", v.candidate_id, v.name, v.region, "posts:", v.posts, "with_image:", v.with_image, "placeholder:", v.placeholder);
  }
  console.log("[report-ci] by_region");
  for (const [, v] of byRegion) {
    console.log("  ", v.region, "posts:", v.posts, "with_image:", v.with_image, "placeholder:", v.placeholder);
  }
  console.log("[report-ci] summary", {
    politicians: politicians.length,
    regions: byRegion.size,
    published_total: rows.length,
  });
}

main().catch((e) => {
  console.error("[report-ci] FAILED", e?.message || String(e));
  process.exit(1);
});
