import { NextResponse } from "next/server";
import { isAdminSession } from "@/lib/auth/adminSession";
import { readJsonBodyWithLimit } from "@/lib/automation/readBody";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";

type ProviderName = "MSI" | "OpenAI" | "Local";

function nowIso(): string {
  return new Date().toISOString();
}

function newRequestId(): string {
  try {
    return crypto.randomUUID();
  } catch {
    return `req_${Date.now()}`;
  }
}

function normalizeBaseUrl(raw: string): string {
  const base = (raw || "https://api.openai.com").trim().replace(/\/+$/, "");
  return base.endsWith("/v1") ? base.slice(0, -3) : base;
}

function normalizeSecret(raw: string | undefined): string {
  const s = String(raw ?? "").trim();
  if (!s) return "";
  return s.endsWith("\\n") ? s.slice(0, -2).trim() : s;
}

function firstUrlIn(text: string): string | null {
  const m = String(text || "").match(/https?:\/\/[^\s)]+/i);
  return m ? m[0] : null;
}

function safeFailure(reason: string): string {
  const r = String(reason || "unknown_error").trim();
  return r.length > 180 ? r.slice(0, 180) : r;
}

function hashSeed(input: string): number {
  // Simple deterministic hash (not cryptographic).
  let h = 2166136261;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function mulberry32(a: number): () => number {
  return function () {
    let t = (a += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function clamp(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, n));
}

function localAbstractSvg(args: { seed: string }): string {
  const seed = hashSeed(args.seed);
  const rnd = mulberry32(seed);
  const w = 1024;
  const h = 1024;

  // Patriotic-inspired palette (subtle).
  const colors = [
    { c: "#facc15", a: 0.22 }, // amarillo
    { c: "#2563eb", a: 0.18 }, // azul
    { c: "#ef4444", a: 0.14 }, // rojo
    { c: "#22c55e", a: 0.12 }, // verde
    { c: "#06b6d4", a: 0.10 }, // cyan
  ];

  const blobs = Array.from({ length: 8 }).map((_, i) => {
    const x = Math.floor(rnd() * w);
    const y = Math.floor(rnd() * h);
    const r = Math.floor(clamp(180 + rnd() * 420, 160, 620));
    const p = colors[i % colors.length];
    const a = clamp(p.a + rnd() * 0.08, 0.08, 0.32);
    return { x, y, r, color: p.c, alpha: a };
  });

  const glass = `
    <rect x="120" y="120" width="784" height="784" rx="72"
      fill="rgba(255,255,255,0.10)" stroke="rgba(255,255,255,0.22)" stroke-width="2"/>
    <rect x="140" y="140" width="744" height="744" rx="64"
      fill="rgba(255,255,255,0.06)" stroke="rgba(255,255,255,0.10)" stroke-width="1"/>
  `;

  const blurId = "b";
  const blobEls = blobs
    .map(
      (b) =>
        `<circle cx="${b.x}" cy="${b.y}" r="${b.r}" fill="${b.color}" fill-opacity="${b.alpha.toFixed(
          3,
        )}" filter="url(#${blurId})"/>`,
    )
    .join("\n");

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">
  <defs>
    <filter id="${blurId}" x="-50%" y="-50%" width="200%" height="200%">
      <feGaussianBlur stdDeviation="90"/>
    </filter>
    <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#0b2f54"/>
      <stop offset="1" stop-color="#081c33"/>
    </linearGradient>
  </defs>
  <rect width="${w}" height="${h}" fill="url(#g)"/>
  ${blobEls}
  ${glass}
</svg>`;
}

async function storeSvgInSupabase(args: {
  admin: ReturnType<typeof createSupabaseAdminClient>;
  candidateId: string;
  draftId: string;
  svg: string;
}): Promise<string | null> {
  const admin = args.admin;
  if (!admin) return null;

  const buf = Buffer.from(args.svg, "utf8");
  const path = `${args.candidateId}/draft-images/${args.draftId}.svg`;
  const up = await admin.storage.from("politician-media").upload(path, buf, {
    contentType: "image/svg+xml",
    upsert: true,
    cacheControl: "3600",
  });
  if (up.error) return null;
  const { data } = admin.storage.from("politician-media").getPublicUrl(path);
  const url = data?.publicUrl;
  return typeof url === "string" && url.startsWith("http") ? url : null;
}

async function tryMsiImage(args: {
  prompt: string;
  maxMs: number;
  requestId: string;
}): Promise<{ ok: true; provider: ProviderName; image_url: string; meta: Record<string, unknown> } | { ok: false; reason: string }> {
  const endpoint =
    (process.env.MARLENY_AI_ENDPOINT ?? process.env.MARLENY_ENDPOINT ?? process.env.MARLENY_API_URL ?? "").trim();
  const apiKey = normalizeSecret(process.env.MARLENY_AI_API_KEY ?? process.env.MARLENY_API_KEY ?? process.env.MARLENY_TOKEN);
  if (!endpoint || !apiKey) return { ok: false, reason: "msi_not_configured" };

  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), args.maxMs);
  try {
    const resp = await fetch(endpoint, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${apiKey}`,
        "x-api-key": apiKey,
        "x-marleny-api-key": apiKey,
      },
      body: JSON.stringify({
        system:
          "Generador de imagen editorial (admin). Devuelve un JSON con {\"image_url\":string,\"prompt\":string} " +
          "o al menos un campo de URL de imagen. Prohibido: logos, texto, propaganda agresiva.",
        user: args.prompt,
        constraints: { content_type: "image", max_output_chars: 1200 },
      }),
      cache: "no-store",
      signal: ctrl.signal,
    });
    clearTimeout(t);
    if (!resp.ok) return { ok: false, reason: `msi_http_${resp.status}` };

    const text = await resp.text().catch(() => "");
    if (!text.trim()) return { ok: false, reason: "msi_empty_response" };

    // Try JSON shapes first, fallback to extracting the first URL.
    try {
      const j = JSON.parse(text) as any;
      const url =
        (typeof j?.image_url === "string" && j.image_url) ||
        (typeof j?.url === "string" && j.url) ||
        (typeof j?.data?.image_url === "string" && j.data.image_url) ||
        (typeof j?.data?.url === "string" && j.data.url) ||
        null;
      const image_url = url ? String(url).trim() : firstUrlIn(text);
      if (!image_url) return { ok: false, reason: "msi_no_image_url" };
      return {
        ok: true,
        provider: "MSI",
        image_url,
        meta: { prompt: typeof j?.prompt === "string" ? j.prompt : null, request_id: args.requestId },
      };
    } catch {
      const image_url = firstUrlIn(text);
      if (!image_url) return { ok: false, reason: "msi_no_image_url" };
      return { ok: true, provider: "MSI", image_url, meta: { request_id: args.requestId } };
    }
  } catch (e: any) {
    clearTimeout(t);
    const name = typeof e?.name === "string" ? e.name : "";
    if (name === "AbortError") return { ok: false, reason: "msi_timeout" };
    return { ok: false, reason: "msi_network_error" };
  }
}

async function tryOpenAiImage(args: {
  prompt: string;
  maxMs: number;
  requestId: string;
}): Promise<{ ok: true; provider: ProviderName; image_url: string; meta: Record<string, unknown> } | { ok: false; reason: string }> {
  const apiKey = normalizeSecret(process.env.OPENAI_API_KEY);
  if (!apiKey) return { ok: false, reason: "openai_not_configured" };

  // Only call real OpenAI for images (most OpenAI-compatible providers don't support /images).
  const base = normalizeBaseUrl(process.env.OPENAI_BASE_URL?.trim() || "https://api.openai.com");
  const host = (() => {
    try {
      return new URL(base).host;
    } catch {
      return "";
    }
  })();
  if (!host.includes("openai.com")) return { ok: false, reason: "openai_images_unsupported_base_url" };

  const model = (process.env.OPENAI_IMAGE_MODEL?.trim() || "gpt-image-1").trim();
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), args.maxMs);
  try {
    const resp = await fetch(`${base}/v1/images/generations`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model,
        prompt: args.prompt,
        size: "1024x1024",
      }),
      cache: "no-store",
      signal: ctrl.signal,
    });
    clearTimeout(t);
    if (!resp.ok) return { ok: false, reason: `openai_http_${resp.status}` };
    const j = (await resp.json().catch(() => null)) as any;
    const u = j?.data?.[0]?.url;
    if (typeof u === "string" && u.trim()) {
      return { ok: true, provider: "OpenAI", image_url: u.trim(), meta: { model, request_id: args.requestId } };
    }
    return { ok: false, reason: "openai_bad_response" };
  } catch (e: any) {
    clearTimeout(t);
    const name = typeof e?.name === "string" ? e.name : "";
    if (name === "AbortError") return { ok: false, reason: "openai_timeout" };
    return { ok: false, reason: "openai_network_error" };
  }
}

export async function POST(req: Request) {
  if (!(await isAdminSession())) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const requestId = newRequestId();
  const body = await readJsonBodyWithLimit(req);
  if (!body.ok) return NextResponse.json({ error: body.error }, { status: 400 });
  if (!body.data || typeof body.data !== "object") return NextResponse.json({ error: "invalid_body" }, { status: 400 });

  const b = body.data as Record<string, unknown>;
  const draft_id = typeof b.draft_id === "string" ? b.draft_id.trim() : "";
  const overrideKeywords = Array.isArray(b.image_keywords) ? (b.image_keywords.filter((x) => typeof x === "string") as string[]) : null;
  if (!draft_id) return NextResponse.json({ error: "draft_id_required" }, { status: 400 });

  const admin = createSupabaseAdminClient();
  if (!admin) return NextResponse.json({ error: "supabase_not_configured" }, { status: 503 });

  const { data: draft, error: dErr } = await admin
    .from("ai_drafts")
    .select("id,candidate_id,topic,generated_text,image_keywords,metadata")
    .eq("id", draft_id)
    .maybeSingle();
  if (dErr) return NextResponse.json({ error: "db_error" }, { status: 500 });
  if (!draft) return NextResponse.json({ error: "not_found" }, { status: 404 });

  const { data: pol } = await admin.from("politicians").select("name,office,region").eq("id", draft.candidate_id).maybeSingle();
  const keywords = (overrideKeywords && overrideKeywords.length ? overrideKeywords : (draft.image_keywords ?? []))
    .map((s: string) => String(s).trim())
    .filter(Boolean)
    .slice(0, 16);

  const prompt = [
    "Imagen editorial para un blog cívico/político en Colombia.",
    "Sin texto, sin logos, sin marcas de agua, sin propaganda agresiva.",
    "Estilo: fotoperiodístico moderno, sobrio, humano, iluminación natural.",
    pol?.region ? `Contexto regional: ${pol.region} (Colombia).` : "Contexto: Colombia.",
    pol?.name ? `Candidato asociado (no retratar rostro real): ${pol.name}.` : "",
    draft.topic ? `Tema: ${draft.topic}` : "",
    keywords.length ? `Keywords (sugerencia): ${keywords.join(", ")}` : "",
  ]
    .filter(Boolean)
    .join("\n");

  console.info("[draft-image] attempt", { requestId, draft_id, candidate_id: draft.candidate_id });

  const attempts: Array<{ provider: ProviderName; ok: boolean; reason?: string }> = [];

  const msi = await tryMsiImage({ prompt, maxMs: 15000, requestId });
  if (msi.ok) attempts.push({ provider: "MSI", ok: true });
  else attempts.push({ provider: "MSI", ok: false, reason: msi.reason });

  const oa = !msi.ok ? await tryOpenAiImage({ prompt, maxMs: 15000, requestId }) : null;
  if (oa && oa.ok) attempts.push({ provider: "OpenAI", ok: true });
  if (oa && !oa.ok) attempts.push({ provider: "OpenAI", ok: false, reason: oa.reason });

  const winner = msi.ok ? msi : oa && oa.ok ? oa : null;

  const prevMeta = (draft.metadata && typeof draft.metadata === "object" ? (draft.metadata as Record<string, unknown>) : {}) as Record<string, unknown>;
  const nextMeta: Record<string, unknown> = {
    ...prevMeta,
    image_ready: Boolean(winner),
    image_provider_attempts: attempts,
    image_last_attempt_at: nowIso(),
    image_request_id: requestId,
  };

  if (winner) {
    nextMeta.image_url = winner.image_url;
    nextMeta.image_metadata = { provider: winner.provider, ...winner.meta, generated_at: nowIso(), keywords };
  } else {
    // LAST RESORT (no AI): generate a local abstract SVG (no text) and attach it.
    const svg = localAbstractSvg({ seed: `${draft.id}:${draft.candidate_id}:${draft.topic}:${keywords.join(",")}` });
    const stored = await storeSvgInSupabase({ admin, candidateId: draft.candidate_id, draftId: draft.id, svg });
    const dataUrl = `data:image/svg+xml;base64,${Buffer.from(svg, "utf8").toString("base64")}`;
    const finalUrl = stored || dataUrl;

    attempts.push({ provider: "Local", ok: true });
    nextMeta.image_ready = true;
    nextMeta.image_url = finalUrl;
    nextMeta.image_metadata = { provider: "Local", generated_at: nowIso(), keywords, request_id: requestId };
    nextMeta.image_last_error = safeFailure((oa && !oa.ok && oa.reason) || (!msi.ok && msi.reason) || "ai_unavailable_local_fallback");
  }

  const { error: upErr } = await admin
    .from("ai_drafts")
    .update({
      metadata: nextMeta,
      ...(overrideKeywords ? { image_keywords: keywords } : {}),
      updated_at: nowIso(),
    })
    .eq("id", draft_id);

  if (upErr) return NextResponse.json({ error: "db_error" }, { status: 500 });

  if (!winner) {
    console.warn("[draft-image] ai_failed_local_fallback", { requestId, draft_id, attempts });
    return NextResponse.json({ ok: true, request_id: requestId, image_url: String(nextMeta.image_url), provider: "Local", fallback: true });
  }

  console.info("[draft-image] success", { requestId, draft_id, provider: winner.provider });
  return NextResponse.json({ ok: true, request_id: requestId, image_url: winner.image_url, provider: winner.provider });
}

