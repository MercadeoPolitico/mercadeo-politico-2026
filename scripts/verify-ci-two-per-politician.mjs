/**
 * Verify Centro Informativo has exactly 2 published posts per politician,
 * and that each post has a real media URL (not the /fallback/news.svg placeholder).
 *
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
  const s = String(u || "");
  return s.includes("/fallback/news.svg");
}

async function main() {
  const envLocal = fs.existsSync(".env.local") ? parseDotenv(fs.readFileSync(".env.local", "utf8")) : {};
  const url = (process.env.NEXT_PUBLIC_SUPABASE_URL || envLocal.NEXT_PUBLIC_SUPABASE_URL || "").trim();
  const key = (process.env.SUPABASE_SERVICE_ROLE_KEY || envLocal.SUPABASE_SERVICE_ROLE_KEY || "").trim();
  assert(url, "Missing NEXT_PUBLIC_SUPABASE_URL");
  assert(key, "Missing SUPABASE_SERVICE_ROLE_KEY");

  const sb = createClient(url, key, { auth: { persistSession: false } });

  const { data: pols, error: polErr } = await sb.from("politicians").select("id,name").order("id", { ascending: true });
  if (polErr) throw new Error("politicians_query_failed");
  const politicians = Array.isArray(pols) ? pols : [];
  assert(politicians.length, "no_politicians");

  const { data: posts, error: postErr } = await sb
    .from("citizen_news_posts")
    .select("id,candidate_id,media_urls,status")
    .eq("status", "published")
    .order("published_at", { ascending: false })
    .limit(5000);
  if (postErr) throw new Error("posts_query_failed");

  const counts = new Map();
  let missingMedia = 0;
  let placeholderMedia = 0;
  let total = 0;

  for (const p of posts ?? []) {
    total++;
    const cid = String(p.candidate_id);
    counts.set(cid, (counts.get(cid) || 0) + 1);
    const arr = Array.isArray(p.media_urls) ? p.media_urls.filter((x) => typeof x === "string") : [];
    const u0 = arr[0] ? String(arr[0]) : "";
    if (!u0.trim()) missingMedia++;
    else if (isPlaceholder(u0)) placeholderMedia++;
  }

  let ok = 0;
  let bad = 0;
  const badSamples = [];
  for (const p of politicians) {
    const id = String(p.id);
    const n = counts.get(id) || 0;
    if (n === 2) ok++;
    else {
      bad++;
      if (badSamples.length < 10) badSamples.push({ candidate_id: id, name: String(p.name || ""), published: n });
    }
  }

  console.log("[verify-ci] summary", {
    politicians: politicians.length,
    published_posts_total: total,
    ok_two_each: ok,
    bad_count: bad,
    missing_media: missingMedia,
    placeholder_media: placeholderMedia,
  });
  if (badSamples.length) console.log("[verify-ci] bad_samples", badSamples);

  if (bad > 0 || missingMedia > 0 || placeholderMedia > 0) process.exit(1);
}

main().catch((e) => {
  console.error("[verify-ci] FAILED", e?.message || String(e));
  process.exit(1);
});

