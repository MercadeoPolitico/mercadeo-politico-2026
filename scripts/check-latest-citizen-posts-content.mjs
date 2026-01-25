/**
 * Validate latest published citizen posts include:
 * - candidate mention
 * - tarjetón mention (when candidate has ballot number)
 * - proposal alignment section (heuristic)
 *
 * Safe output: booleans only, no full text.
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

function hasTarjeton(body) {
  return /tarjet[oó]n\s*\d+/i.test(String(body || ""));
}

function hasBoldMarker(body) {
  return /\*\*[^*]{2,80}\*\*/.test(String(body || ""));
}

function hasAlignmentSentence(body) {
  const s = String(body || "").toLowerCase();
  return s.includes("en su programa") || s.includes("propuestas") || s.includes("cómo encaja");
}

async function main() {
  const envLocal = fs.existsSync(".env.local") ? parseDotenv(fs.readFileSync(".env.local", "utf8")) : {};
  const url = (process.env.NEXT_PUBLIC_SUPABASE_URL || envLocal.NEXT_PUBLIC_SUPABASE_URL || "").trim();
  const key = (process.env.SUPABASE_SERVICE_ROLE_KEY || envLocal.SUPABASE_SERVICE_ROLE_KEY || "").trim();
  assert(url, "Missing NEXT_PUBLIC_SUPABASE_URL");
  assert(key, "Missing SUPABASE_SERVICE_ROLE_KEY");

  const sb = createClient(url, key, { auth: { persistSession: false } });

  const { data: pols } = await sb.from("politicians").select("id,name,ballot_number").order("id", { ascending: true });
  const politicians = Array.isArray(pols) ? pols : [];
  assert(politicians.length, "no_politicians");

  for (const p of politicians) {
    const id = String(p.id);
    const name = String(p.name || "");
    const { data: rows } = await sb
      .from("citizen_news_posts")
      .select("id,body,published_at")
      .eq("status", "published")
      .eq("candidate_id", id)
      .order("published_at", { ascending: false })
      .limit(2);

    const body = rows?.[0]?.body ?? "";
    const okName = name && String(body).toLowerCase().includes(name.toLowerCase());
    const okTar = p.ballot_number ? hasTarjeton(body) : true;
    console.log("[content-check]", {
      candidate_id: id,
      has_post: Boolean(rows && rows.length),
      mentions_candidate: okName,
      mentions_tarjeton: okTar,
      has_bold: hasBoldMarker(body),
      has_alignment: hasAlignmentSentence(body),
    });
  }
}

main().catch((e) => {
  console.error("[check-latest-citizen-posts-content] FAILED", e?.message || String(e));
  process.exit(1);
});

