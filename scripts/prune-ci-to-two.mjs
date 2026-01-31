/**
 * Prune Centro Informativo to exactly 2 published posts per politician.
 * Safe: no secrets printed.
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

  const { data: pols, error: polErr } = await sb.from("politicians").select("id,name").order("id", { ascending: true });
  if (polErr) throw new Error("politicians_query_failed");

  for (const p of pols ?? []) {
    const id = String(p.id);
    const { data: posts } = await sb
      .from("citizen_news_posts")
      .select("id,published_at")
      .eq("status", "published")
      .eq("candidate_id", id)
      .order("published_at", { ascending: false })
      .limit(50);
    const rows = Array.isArray(posts) ? posts : [];
    if (rows.length <= 2) {
      console.log("[prune]", { candidate_id: id, kept: rows.length, deleted: 0 });
      continue;
    }
    const toDelete = rows.slice(2).map((r) => String(r.id));
    await sb.from("citizen_news_posts").delete().in("id", toDelete);
    console.log("[prune]", { candidate_id: id, kept: 2, deleted: toDelete.length });
  }
}

main().catch((e) => {
  console.error("[prune] FAILED", e?.message || String(e));
  process.exit(1);
});

