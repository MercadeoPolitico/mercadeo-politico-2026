import { NextResponse } from "next/server";
import { isAdminSession } from "@/lib/auth/adminSession";
import { readJsonBodyWithLimit } from "@/lib/automation/readBody";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";

type ProviderName = "MSI" | "OpenAI";

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
    nextMeta.image_last_error = safeFailure((oa && !oa.ok && oa.reason) || (!msi.ok && msi.reason) || "upstream_error");
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
    console.warn("[draft-image] failed", { requestId, draft_id, attempts });
    return NextResponse.json(
      { ok: false, error: "image_generation_failed", request_id: requestId, reason: nextMeta.image_last_error, attempts },
      { status: 502 },
    );
  }

  console.info("[draft-image] success", { requestId, draft_id, provider: winner.provider });
  return NextResponse.json({ ok: true, request_id: requestId, image_url: winner.image_url, provider: winner.provider });
}

