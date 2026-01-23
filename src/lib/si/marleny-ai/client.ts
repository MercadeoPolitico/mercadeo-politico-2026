import "server-only";
import type { ContentType } from "@/lib/automation/types";
import { maxOutputCharsFor, maxPromptCharsFor } from "@/lib/automation/limits";

export type MarlenyAiCallInput = {
  candidateId: string;
  contentType: ContentType;
  topic: string;
  tone?: string;
};

export type MarlenyAiCallResult =
  | { ok: true; text: string }
  | { ok: false; error: "disabled" | "not_configured" | "bad_request" | "upstream_error" };

function isEnabled(): boolean {
  // Continuity-first:
  // - If MARLENY_AI_ENABLED="false" => disabled.
  // - If MARLENY_AI_ENABLED="true"  => enabled.
  // - If unset but config exists => enabled (common Vercel setup).
  const flag = process.env.MARLENY_AI_ENABLED;
  if (flag === "false") return false;
  if (flag === "true") return true;
  return hasConfig();
}

function hasConfig(): boolean {
  const key = process.env.MARLENY_AI_API_KEY ?? process.env.MARLENY_API_KEY ?? process.env.MARLENY_TOKEN;
  const endpoint = process.env.MARLENY_AI_ENDPOINT ?? process.env.MARLENY_ENDPOINT ?? process.env.MARLENY_API_URL;
  return Boolean(key && key.trim().length && endpoint && endpoint.trim().length);
}

function buildPrompt(input: MarlenyAiCallInput): { system: string; user: string } {
  // Short, functional system prompt (cost-aware, no roleplay).
  const system =
    "Asistente de redacción cívica y política. Sé sobrio, institucional, verificable y ético. " +
    "Prohibido: desinformación, urgencia falsa, miedo, ataques personales, segmentación psicológica o demográfica. " +
    "No publiques ni sugieras acciones ilegales. Responde en español neutro para Colombia.";

  const toneLine = input.tone ? `Tono: ${input.tone.trim()}` : "Tono: sobrio y humano";

  const format =
    input.contentType === "proposal"
      ? "Formato: 4–6 bloques cortos con título y 2–3 líneas por bloque."
      : input.contentType === "blog"
        ? "Formato: (1) título sugerido, (2) resumen en 5–7 líneas, (3) esquema con 6–10 bullets."
        : [
            "IMPORTANTE: Responde SOLO en JSON válido (sin markdown).",
            "JSON schema:",
            "{",
            '  "base": string,',
            '  "variants": { "facebook": string, "instagram": string, "x": string },',
            '  "image_keywords": string[]',
            "}",
            "Reglas:",
            '- "base": mensaje principal (máx. ~500 caracteres).',
            '- "variants.facebook": 1 variante (máx. ~700).',
            '- "variants.instagram": 1 variante (máx. ~700) con 3–6 hashtags sobrios opcionales.',
            '- "variants.x": 1 variante (máx. 280).',
            "- Sin ataques personales. Sin miedo. Sin urgencia falsa. Sin inventar datos.",
            "- image_keywords: 5–10 palabras clave para imágenes (solo texto; NO scraping).",
          ].join("\n");

  const user =
    [
      `CandidateID: ${input.candidateId}`,
      `Tipo: ${input.contentType}`,
      `Tema: ${input.topic}`,
      toneLine,
      format,
      "Nota: No inventes datos biográficos ni promesas específicas si no están confirmadas. Evita slogans.",
    ].join("\n");

  return { system, user };
}

export async function callMarlenyAI(input: MarlenyAiCallInput): Promise<MarlenyAiCallResult> {
  if (!isEnabled()) return { ok: false, error: "disabled" };
  if (!hasConfig()) return { ok: false, error: "not_configured" };

  const { system, user } = buildPrompt(input);

  const maxPrompt = maxPromptCharsFor(input.contentType);
  const maxOut = maxOutputCharsFor(input.contentType);

  const truncatedUser = user.length > maxPrompt ? user.slice(0, maxPrompt) : user;

  // We do not assume a proprietary API schema; we send a minimal, generic request.
  // The Marleny service can adapt this contract server-side.
  const payload = {
    system,
    user: truncatedUser,
    constraints: {
      max_output_chars: maxOut,
      content_type: input.contentType,
    },
  };

  try {
    const endpoint = (process.env.MARLENY_AI_ENDPOINT ?? process.env.MARLENY_ENDPOINT ?? process.env.MARLENY_API_URL)!.trim();
    const key = (process.env.MARLENY_AI_API_KEY ?? process.env.MARLENY_API_KEY ?? process.env.MARLENY_TOKEN)!.trim();
    const resp = await fetch(endpoint, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${key}`,
      },
      body: JSON.stringify(payload),
      cache: "no-store",
    });

    if (!resp.ok) return { ok: false, error: resp.status === 400 ? "bad_request" : "upstream_error" };

    const data = (await resp.json()) as unknown;
    const text =
      typeof data === "object" && data !== null && "text" in (data as Record<string, unknown>)
        ? (data as Record<string, unknown>).text
        : null;

    if (typeof text !== "string" || text.trim().length === 0) return { ok: false, error: "upstream_error" };

    const clipped = text.trim().slice(0, maxOut);
    return { ok: true, text: clipped };
  } catch {
    return { ok: false, error: "upstream_error" };
  }
}

