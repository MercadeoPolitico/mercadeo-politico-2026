/**
 * Smoke: trigger orchestration for two candidates (prod) and verify posts exist.
 *
 * - Reads MP26_BASE_URL + MP26_AUTOMATION_TOKEN from .env.local (or process.env)
 * - Does NOT print secrets
 * - Calls:
 *   - GET /api/automation/candidates
 *   - POST /api/automation/editorial-orchestrate  (one per candidate, max_items=1)
 * - Then prints citizen_news_posts published_count (via Supabase service role from .env.local)
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

async function sleep(ms) {
  await new Promise((r) => setTimeout(r, ms));
}

async function main() {
  const envLocal = fs.existsSync(".env.local") ? parseDotenv(fs.readFileSync(".env.local", "utf8")) : {};

  const base = (process.env.MP26_BASE_URL || envLocal.MP26_BASE_URL || envLocal.NEXT_PUBLIC_SITE_URL || "").trim().replace(/\/+$/, "");
  const token = (process.env.MP26_AUTOMATION_TOKEN || envLocal.MP26_AUTOMATION_TOKEN || "").trim();
  assert(base, "Missing MP26_BASE_URL (or NEXT_PUBLIC_SITE_URL)");
  assert(token, "Missing MP26_AUTOMATION_TOKEN");

  const candResp = await fetch(`${base}/api/automation/candidates`, {
    headers: { "x-automation-token": token },
    cache: "no-store",
  });
  if (!candResp.ok) throw new Error("candidates_failed");
  const candJson = await candResp.json();
  const candidates = Array.isArray(candJson?.candidates) ? candJson.candidates : [];
  assert(candidates.length >= 2, "Need at least 2 candidates");

  // Pick one Cámara (Meta) and one Senado (Colombia)
  const camara = candidates.find((c) => String(c.office || "").toLowerCase().includes("cámara")) || candidates[0];
  const senado = candidates.find((c) => String(c.office || "").toLowerCase().includes("senado")) || candidates[1];

  const targets = [camara, senado];

  for (const c of targets) {
    let last = null;
    for (let attempt = 1; attempt <= 2; attempt++) {
      const r = await fetch(`${base}/api/automation/editorial-orchestrate`, {
        method: "POST",
        headers: { "content-type": "application/json", "x-automation-token": token },
        body: JSON.stringify({ candidate_id: c.id, max_items: 1 }),
        cache: "no-store",
      });
      const j = await r.json().catch(() => ({}));
      last = { ok: r.ok, request_id: j?.request_id ?? null, error: j?.error ?? null };
      if (r.ok) break;
      await sleep(800);
    }
    console.log("[smoke] orchestrate", {
      ok: Boolean(last?.ok),
      candidate: { id: c.id, office: c.office, region: c.region },
      request_id: last?.request_id ?? null,
      error: last?.ok ? null : last?.error ?? "unknown",
    });
  }

  // Wait a moment for inserts to settle
  await sleep(1500);

  const url = (process.env.NEXT_PUBLIC_SUPABASE_URL || envLocal.NEXT_PUBLIC_SUPABASE_URL || "").trim();
  const key = (process.env.SUPABASE_SERVICE_ROLE_KEY || envLocal.SUPABASE_SERVICE_ROLE_KEY || "").trim();
  assert(url, "Missing NEXT_PUBLIC_SUPABASE_URL");
  assert(key, "Missing SUPABASE_SERVICE_ROLE_KEY");
  const sb = createClient(url, key, { auth: { persistSession: false } });

  const { count, error } = await sb.from("citizen_news_posts").select("*", { count: "exact", head: true }).eq("status", "published");
  if (error) throw new Error("count_failed");
  console.log("[smoke] citizen_news_posts published_count", count ?? null);
}

main().catch((e) => {
  console.error("[smoke] FAILED", e?.message || String(e));
  process.exit(1);
});

