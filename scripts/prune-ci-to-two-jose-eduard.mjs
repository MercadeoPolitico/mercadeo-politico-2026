/**
 * Prune Centro Informativo posts to exactly 2 for José + 2 for Eduard.
 *
 * Use when automation finishes late and extra posts appear.
 * Does NOT generate new posts; only deletes older extras.
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

function normalizeName(s) {
  return String(s || "")
    .toLowerCase()
    .normalize("NFKD")
    .replaceAll(/[\u0300-\u036f]/g, "")
    .trim();
}

async function prune(sb, candidateId) {
  const { data } = await sb
    .from("citizen_news_posts")
    .select("id,published_at")
    .eq("status", "published")
    .eq("candidate_id", candidateId)
    .order("published_at", { ascending: false })
    .limit(50);
  const rows = Array.isArray(data) ? data : [];
  if (rows.length <= 2) return { deleted: 0, kept: rows.length };
  const toDelete = rows.slice(2).map((r) => String(r.id));
  await sb.from("citizen_news_posts").delete().in("id", toDelete);
  return { deleted: toDelete.length, kept: 2 };
}

async function count(sb, candidateId) {
  const r = await sb
    .from("citizen_news_posts")
    .select("id", { count: "exact", head: true })
    .eq("status", "published")
    .eq("candidate_id", candidateId);
  return r.count ?? 0;
}

async function main() {
  const envLocal = fs.existsSync(".env.local") ? parseDotenv(fs.readFileSync(".env.local", "utf8")) : {};
  const url = (process.env.NEXT_PUBLIC_SUPABASE_URL || envLocal.NEXT_PUBLIC_SUPABASE_URL || "").trim();
  const key = (process.env.SUPABASE_SERVICE_ROLE_KEY || envLocal.SUPABASE_SERVICE_ROLE_KEY || "").trim();
  assert(url, "Missing NEXT_PUBLIC_SUPABASE_URL");
  assert(key, "Missing SUPABASE_SERVICE_ROLE_KEY");
  const sb = createClient(url, key, { auth: { persistSession: false } });

  const { data: pols } = await sb.from("politicians").select("id,name").order("name", { ascending: true });
  const list = Array.isArray(pols) ? pols : [];
  const jose = list.find((p) => normalizeName(p?.name).includes("jose") && normalizeName(p?.name).includes("martinez")) || null;
  const eduard = list.find((p) => normalizeName(p?.name).includes("eduard") && normalizeName(p?.name).includes("buitrago")) || null;
  assert(jose?.id, "target_not_found:jose");
  assert(eduard?.id, "target_not_found:eduard");

  const beforeJose = await count(sb, jose.id);
  const beforeEdu = await count(sb, eduard.id);
  const pj = await prune(sb, jose.id);
  const pe = await prune(sb, eduard.id);
  const afterJose = await count(sb, jose.id);
  const afterEdu = await count(sb, eduard.id);
  console.log("[prune-ci] jose", { before: beforeJose, after: afterJose, pruned: pj });
  console.log("[prune-ci] eduard", { before: beforeEdu, after: afterEdu, pruned: pe });
}

main().catch((e) => {
  console.error("[prune-ci] FAILED", e?.message || String(e));
  process.exit(1);
});

