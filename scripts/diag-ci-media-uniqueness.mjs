/**
 * Verify Centro Informativo media URLs are unique (no repeats).
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

async function main() {
  const envLocal = fs.existsSync(".env.local") ? parseDotenv(fs.readFileSync(".env.local", "utf8")) : {};
  const url = (process.env.NEXT_PUBLIC_SUPABASE_URL || envLocal.NEXT_PUBLIC_SUPABASE_URL || "").trim();
  const key = (process.env.SUPABASE_SERVICE_ROLE_KEY || envLocal.SUPABASE_SERVICE_ROLE_KEY || "").trim();
  assert(url, "Missing NEXT_PUBLIC_SUPABASE_URL");
  assert(key, "Missing SUPABASE_SERVICE_ROLE_KEY");
  const sb = createClient(url, key, { auth: { persistSession: false } });

  const { data, error } = await sb
    .from("citizen_news_posts")
    .select("id,candidate_id,slug,title,media_urls,published_at")
    .eq("status", "published")
    .order("published_at", { ascending: false })
    .limit(200);
  if (error) throw new Error(`db_error:${error.message || "unknown"}`);

  const rows = Array.isArray(data) ? data : [];
  const urls = rows
    .map((r) => (Array.isArray(r.media_urls) ? String(r.media_urls[0] || "").trim() : ""))
    .filter(Boolean);
  const counts = new Map();
  for (const u of urls) counts.set(u, (counts.get(u) || 0) + 1);
  const dups = Array.from(counts.entries()).filter(([, n]) => n > 1);

  const titleKey = (s) =>
    String(s || "")
      .toLowerCase()
      .normalize("NFKD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9\s]/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  const titleCounts = new Map();
  for (const r of rows) {
    const k = titleKey(r.title);
    if (!k) continue;
    titleCounts.set(k, (titleCounts.get(k) || 0) + 1);
  }
  const titleDups = Array.from(titleCounts.entries()).filter(([, n]) => n > 1);

  console.log("[ci-media] summary", {
    posts: rows.length,
    media_unique: counts.size,
    media_duplicate_urls: dups.length,
    title_duplicate_keys: titleDups.length,
  });
  if (dups.length) {
    console.log(
      "[ci-media] duplicates",
      dups.slice(0, 20).map(([url, n]) => ({ n, url: url.length > 160 ? `${url.slice(0, 160)}…` : url })),
    );
    process.exit(1);
  }
  if (titleDups.length) {
    console.log("[ci-media] duplicate_titles", titleDups.slice(0, 20).map(([k, n]) => ({ n, key: k.slice(0, 140) })));
    process.exit(1);
  }
}

main().catch((e) => {
  console.error("[ci-media] FAILED", e?.message || String(e));
  process.exit(1);
});

