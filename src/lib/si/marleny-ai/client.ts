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

function normalizeSecret(raw: string | undefined): string {
  const s = String(raw ?? "").trim();
  if (!s) return "";
  // Fix accidental trailing literal \n in copied secrets (common).
  return s.endsWith("\\n") ? s.slice(0, -2).trim() : s;
}

function buildPrompt(input: MarlenyAiCallInput): { system: string; user: string } {
  // Short, functional system prompt (cost-aware, no roleplay).
  const system =
    "Asistente de redacción cívica y política. Sé sobrio, institucional, verificable y ético. " +
    "Prohibido: desinformación, urgencia falsa, miedo, ataques personales, segmentación psicológica o demográfica. " +
    "No publiques ni sugieras acciones ilegales. Responde en español neutro para Colombia.";

  const toneLine = input.tone ? `Tono: ${input.tone.trim()}` : "Tono: sobrio y humano";

  // If caller already demands strict JSON (e.g., editorial orchestrator), avoid adding
  // a conflicting “blog/proposal” format instruction that can derail the model.
  const wantsStrictJson = /RESPONDE\s+SOLO\s+JSON/i.test(input.topic) || /"sentiment"\s*:/i.test(input.topic);

  const format =
    wantsStrictJson
      ? "IMPORTANTE: Respeta exactamente el formato JSON solicitado en el tema/instrucción. NO agregues texto fuera del JSON."
      : input.contentType === "proposal"
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
    const key = normalizeSecret(process.env.MARLENY_AI_API_KEY ?? process.env.MARLENY_API_KEY ?? process.env.MARLENY_TOKEN);
    const resp = await fetch(endpoint, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        // Support both common auth conventions (service may accept one of them).
        authorization: `Bearer ${key}`,
        "x-api-key": key,
        "x-marleny-api-key": key,
      },
      body: JSON.stringify(payload),
      cache: "no-store",
    });

    if (!resp.ok) return { ok: false, error: resp.status === 400 ? "bad_request" : "upstream_error" };

    const rawText = await resp.text().catch(() => "");
    if (!rawText.trim()) return { ok: false, error: "upstream_error" };

    // Try JSON first, but tolerate plain-text responses.
    let extracted: string | null = null;
    try {
      const data = JSON.parse(rawText) as any;
      extracted =
        (typeof data?.text === "string" && data.text) ||
        (typeof data?.reply === "string" && data.reply) ||
        (typeof data?.message === "string" && data.message) ||
        (typeof data?.content === "string" && data.content) ||
        (typeof data?.data?.text === "string" && data.data.text) ||
        (typeof data?.choices?.[0]?.message?.content === "string" && data.choices[0].message.content) ||
        null;
    } catch {
      extracted = rawText;
    }

    const text = String(extracted ?? "").trim();
    if (!text) return { ok: false, error: "upstream_error" };
    return { ok: true, text: text.slice(0, maxOut) };
  } catch {
    return { ok: false, error: "upstream_error" };
  }
}

