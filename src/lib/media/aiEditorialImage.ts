import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

type ProviderName = "MSI" | "OpenAI";

function normalizeSecret(v: unknown): string {
  const s = String(v ?? "").trim();
  if (!s) return "";
  if ((s.startsWith('"') && s.endsWith('"')) || (s.startsWith("'") && s.endsWith("'"))) return s.slice(1, -1).trim();
  return s.endsWith("\\n") ? s.slice(0, -2).trim() : s;
}

function normalizeBaseUrl(raw: string | undefined, fallback: string): string {
  const base = String(raw ?? fallback).trim().replace(/\/+$/, "");
  return base || fallback;
}

function extFromContentType(ct: string): "png" | "jpg" | "webp" {
  const t = String(ct || "").toLowerCase();
  if (t.includes("png")) return "png";
  if (t.includes("webp")) return "webp";
  return "jpg";
}

async function downloadImage(args: { url: string; maxBytes: number; timeoutMs: number }): Promise<{ ok: true; buf: Buffer; contentType: string } | { ok: false; reason: string }> {
  const target = String(args.url || "").trim();
  if (!/^https?:\/\//i.test(target)) return { ok: false, reason: "invalid_url" };

  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), args.timeoutMs);
  try {
    const resp = await fetch(target, {
      method: "GET",
      redirect: "follow",
      cache: "no-store",
      signal: ctrl.signal,
      headers: { accept: "image/avif,image/webp,image/apng,image/*,*/*;q=0.8" },
    });
    if (!resp.ok) return { ok: false, reason: `http_${resp.status}` };
    const ct = resp.headers.get("content-type") ?? "application/octet-stream";
    if (!ct.toLowerCase().startsWith("image/")) return { ok: false, reason: "not_image" };
    const len = Number(resp.headers.get("content-length") ?? "0");
    if (Number.isFinite(len) && len > args.maxBytes) return { ok: false, reason: "too_large" };
    const ab = await resp.arrayBuffer();
    if (ab.byteLength > args.maxBytes) return { ok: false, reason: "too_large" };
    return { ok: true, buf: Buffer.from(ab), contentType: ct };
  } catch (e: any) {
    const name = typeof e?.name === "string" ? e.name : "";
    if (name === "AbortError") return { ok: false, reason: "timeout" };
    return { ok: false, reason: "network_error" };
  } finally {
    clearTimeout(t);
  }
}

async function tryMsiImage(args: {
  prompt: string;
  maxMs: number;
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
          "Generador de imagen editorial (first-party). Devuelve un JSON con {\"image_url\":string,\"prompt\":string} " +
          "o al menos una URL de imagen. Reglas estrictas: sin texto, sin logos, sin marcas, sin propaganda, sin violencia explícita, " +
          "sin rostros reales de personas (si aparecen, que sean genéricos/no-identificables). Estilo: fotoperiodístico realista, sobrio y atractivo.",
        user: args.prompt,
        constraints: { content_type: "image", max_output_chars: 1400 },
      }),
      cache: "no-store",
      signal: ctrl.signal,
    });
    clearTimeout(t);
    if (!resp.ok) return { ok: false, reason: `msi_http_${resp.status}` };

    const text = await resp.text().catch(() => "");
    if (!text.trim()) return { ok: false, reason: "msi_empty_response" };
    try {
      const j = JSON.parse(text) as any;
      const url =
        (typeof j?.image_url === "string" && j.image_url) ||
        (typeof j?.url === "string" && j.url) ||
        (typeof j?.data?.image_url === "string" && j.data.image_url) ||
        (typeof j?.data?.url === "string" && j.data.url) ||
        null;
      const image_url = url ? String(url).trim() : "";
      if (!image_url) return { ok: false, reason: "msi_no_image_url" };
      return { ok: true, provider: "MSI", image_url, meta: { prompt: typeof j?.prompt === "string" ? j.prompt : null } };
    } catch {
      // Fallback: find first URL in body
      const m = text.match(/https?:\/\/\S+/i)?.[0] ?? "";
      const image_url = m ? String(m).trim() : "";
      if (!image_url) return { ok: false, reason: "msi_no_image_url" };
      return { ok: true, provider: "MSI", image_url, meta: {} };
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
}): Promise<{ ok: true; provider: ProviderName; image_url: string; meta: Record<string, unknown> } | { ok: false; reason: string }> {
  const apiKey = normalizeSecret(process.env.OPENAI_API_KEY);
  if (!apiKey) return { ok: false, reason: "openai_not_configured" };

  // Only call real OpenAI for images (most OpenAI-compatible providers don't support /images).
  const base = normalizeBaseUrl(process.env.OPENAI_BASE_URL?.trim() || "https://api.openai.com", "https://api.openai.com");
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
      return { ok: true, provider: "OpenAI", image_url: u.trim(), meta: { model } };
    }
    return { ok: false, reason: "openai_bad_response" };
  } catch (e: any) {
    clearTimeout(t);
    const name = typeof e?.name === "string" ? e.name : "";
    if (name === "AbortError") return { ok: false, reason: "openai_timeout" };
    return { ok: false, reason: "openai_network_error" };
  }
}

export async function generateAndStoreNewsImage(args: {
  admin: SupabaseClient;
  candidateId: string;
  seed: string;
  prompt: string;
  maxMs?: number;
}): Promise<
  | { ok: true; public_url: string; provider: ProviderName; meta: Record<string, unknown> }
  | { ok: false; reason: string }
> {
  const admin = args.admin;
  if (!admin) return { ok: false, reason: "supabase_not_configured" };

  const maxMs = typeof args.maxMs === "number" ? args.maxMs : 18_000;
  const prompt = String(args.prompt || "").trim();
  if (!prompt) return { ok: false, reason: "prompt_required" };

  const msi = await tryMsiImage({ prompt, maxMs });
  const oa = !msi.ok ? await tryOpenAiImage({ prompt, maxMs }) : null;
  const winner = msi.ok ? msi : oa && oa.ok ? oa : null;
  if (!winner) return { ok: false, reason: (oa && !oa.ok && oa.reason) || (!msi.ok && msi.reason) || "ai_unavailable" };

  const dl = await downloadImage({ url: winner.image_url, maxBytes: 6_500_000, timeoutMs: 12_000 });
  if (!dl.ok) return { ok: false, reason: `download_${dl.reason}` };

  const ext = extFromContentType(dl.contentType);
  const ymd = new Date().toISOString().slice(0, 10);
  const safeSeed = String(args.seed || "news").replaceAll(/[^a-z0-9_-]+/gi, "-").slice(0, 80);
  const path = `${args.candidateId}/news-images/${ymd}/${Date.now()}-${safeSeed}.${ext}`;

  const up = await admin.storage.from("politician-media").upload(path, dl.buf, {
    contentType: dl.contentType,
    upsert: false,
    cacheControl: "3600",
  });
  if (up.error) return { ok: false, reason: "storage_upload_failed" };

  const { data } = admin.storage.from("politician-media").getPublicUrl(path);
  const publicUrl = data?.publicUrl;
  if (typeof publicUrl !== "string" || !publicUrl.startsWith("http")) return { ok: false, reason: "storage_public_url_failed" };

  return {
    ok: true,
    public_url: publicUrl,
    provider: winner.provider,
    meta: { ...(winner.meta ?? {}), content_type: dl.contentType },
  };
}

