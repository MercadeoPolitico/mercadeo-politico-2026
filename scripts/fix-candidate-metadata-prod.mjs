/**
 * Fix candidate metadata in Supabase (safe, idempotent).
 *
 * - Eduard Buitrago Acero: tarjetón 22 (Senado, nacional → region Colombia)
 * - José Ángel Martínez: tarjetón 103 (Cámara, Departamento del Meta)
 *
 * Uses Supabase service role from .env.local (or process.env).
 * Does NOT print any secret values.
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
    .replaceAll(/\s+/g, " ")
    .trim();
}

async function main() {
  const envLocal = fs.existsSync(".env.local") ? parseDotenv(fs.readFileSync(".env.local", "utf8")) : {};
  const url = (process.env.NEXT_PUBLIC_SUPABASE_URL || envLocal.NEXT_PUBLIC_SUPABASE_URL || "").trim();
  const key = (process.env.SUPABASE_SERVICE_ROLE_KEY || envLocal.SUPABASE_SERVICE_ROLE_KEY || "").trim();
  assert(url, "Missing NEXT_PUBLIC_SUPABASE_URL");
  assert(key, "Missing SUPABASE_SERVICE_ROLE_KEY");

  const sb = createClient(url, key, { auth: { persistSession: false } });

  // Load once (small table) so we can match robustly even if IDs/slugs differ.
  const all = await sb.from("politicians").select("id,slug,name,office,region,ballot_number").order("name", { ascending: true });
  if (all.error) throw new Error(`politicians_select_failed:${all.error.message || "unknown"}`);
  const list = Array.isArray(all.data) ? all.data : [];
  assert(list.length, "no_politicians");

  const eduard =
    list.find((p) => normalizeName(p?.name).includes("eduard") && normalizeName(p?.name).includes("buitrago")) ||
    list.find((p) => normalizeName(p?.slug) === "eduard-buitrago") ||
    list.find((p) => normalizeName(p?.id) === "eduard-buitrago") ||
    list.find((p) => normalizeName(p?.id) === "eduardo-buitrago") ||
    null;

  const jose =
    list.find((p) => normalizeName(p?.name).includes("jose") && normalizeName(p?.name).includes("martinez")) ||
    list.find((p) => normalizeName(p?.slug) === "jose-angel-martinez") ||
    list.find((p) => normalizeName(p?.id) === "jose-angel-martinez") ||
    null;

  assert(eduard?.id, "target_not_found:eduard");
  assert(jose?.id, "target_not_found:jose");

  const targets = [
    {
      id: String(jose.id),
      patch: { ballot_number: 103, region: "Departamento del Meta" },
    },
    {
      id: String(eduard.id),
      patch: { ballot_number: 22, region: "Colombia", slug: "eduard-buitrago" },
    },
  ];

  const before = list.filter((p) => targets.some((t) => t.id === String(p.id)));

  for (const t of targets) {
    const { error } = await sb.from("politicians").update({ ...t.patch, updated_at: new Date().toISOString() }).eq("id", t.id);
    if (error) throw new Error(`politicians_update_failed:${t.id}:${error.message || "unknown"}`);
  }

  const after = await sb.from("politicians").select("id,slug,name,office,region,ballot_number").in(
    "id",
    targets.map((t) => t.id),
  );
  if (after.error) throw new Error(`politicians_select_failed_after:${after.error.message || "unknown"}`);

  console.log("[fix-candidate-metadata] ok", {
    updated: targets.map((t) => t.id),
    before,
    after: after.data ?? [],
  });
}

main().catch((e) => {
  console.error("[fix-candidate-metadata] FAILED", e?.message || String(e));
  process.exit(1);
});

