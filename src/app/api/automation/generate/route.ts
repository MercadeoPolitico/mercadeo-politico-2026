import { NextResponse } from "next/server";
import { readJsonBodyWithLimit } from "@/lib/automation/readBody";
import { estimateTokens, maxOutputCharsFor } from "@/lib/automation/limits";
import { validateGenerateRequest } from "@/lib/automation/validate";
import { callMarlenyAI } from "@/lib/si/marleny-ai/client";
import type { GenerateResponse } from "@/lib/automation/types";
import { isAdminSession } from "@/lib/auth/adminSession";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

/**
 * Controlled AI generation endpoint (Paso H.1)
 *
 * - Server-side only
 * - One successful AI response per request (failover supported)
 * - No retries, no streaming
 * - Never stores, never publishes, never forwards automatically
 * - Disabled-by-default unless AUTOMATION_API_TOKEN is set and matches header
 */

function isBrowserOrigin(req: Request): boolean {
  // Browser fetches typically include sec-fetch-* and Origin/Referer.
  // n8n/server-to-server calls normally do not.
  return Boolean(
    req.headers.get("sec-fetch-site") ||
      req.headers.get("sec-fetch-mode") ||
      req.headers.get("sec-fetch-dest") ||
      req.headers.get("origin") ||
      req.headers.get("referer"),
  );
}

function normalizeToken(v: unknown): string {
  const s = String(v ?? "").trim();
  if (!s) return "";
  if ((s.startsWith('"') && s.endsWith('"')) || (s.startsWith("'") && s.endsWith("'"))) return s.slice(1, -1).trim();
  return s.endsWith("\\n") ? s.slice(0, -2).trim() : s;
}

function normalizeBaseUrl(raw: string): string {
  const base = (raw || "https://api.openai.com").trim().replace(/\/+$/, "");
  return base.endsWith("/v1") ? base.slice(0, -3) : base;
}

function hasOpenAiConfig(): boolean {
  return Boolean(process.env.OPENAI_API_KEY && String(process.env.OPENAI_API_KEY).trim().length);
}

async function callOpenAiOnce(args: {
  model: string;
  prompt: string;
  maxOutputChars: number;
}): Promise<{ ok: true; text: string } | { ok: false; error: "not_configured" | "upstream_error" | "bad_response" }> {
  const apiKey = (process.env.OPENAI_API_KEY ?? "").trim();
  if (!apiKey) return { ok: false, error: "not_configured" };

  const base = normalizeBaseUrl(process.env.OPENAI_BASE_URL?.trim() || "https://api.openai.com");
  const resp = await fetch(`${base}/v1/chat/completions`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: args.model,
      temperature: 0.2,
      messages: [
        {
          role: "system",
          content:
            "Synthetic Intelligence. Generación bajo control: una solicitud = una respuesta. " +
            "Sé sobrio, institucional, verificable y ético. Prohibido: desinformación, urgencia falsa, miedo, ataques personales.",
        },
        { role: "user", content: args.prompt },
      ],
    }),
    cache: "no-store",
  });

  if (!resp.ok) return { ok: false, error: "upstream_error" };
  const json = (await resp.json().catch(() => null)) as any;
  const content = json?.choices?.[0]?.message?.content;
  const text = typeof content === "string" ? content.trim() : "";
  if (!text) return { ok: false, error: "bad_response" };
  return { ok: true, text: text.slice(0, args.maxOutputChars) };
}

export async function POST(req: Request) {
  // Automation endpoints are server-to-server only.
  // Admin UIs must use /api/admin/automation/* wrappers.
  if (isBrowserOrigin(req)) {
    console.warn("[automation/generate] rejected_browser_origin", {
      path: "/api/automation/generate",
      hasOrigin: Boolean(req.headers.get("origin")),
      hasReferer: Boolean(req.headers.get("referer")),
      hasSecFetch: Boolean(req.headers.get("sec-fetch-site") || req.headers.get("sec-fetch-mode") || req.headers.get("sec-fetch-dest")),
    });
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const apiToken = normalizeToken(process.env.MP26_AUTOMATION_TOKEN ?? process.env.AUTOMATION_API_TOKEN);
  const headerToken = normalizeToken(req.headers.get("x-automation-token") ?? "");
  if (!apiToken) return NextResponse.json({ error: "not_configured" }, { status: 503 });
  if (headerToken !== apiToken) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const body = await readJsonBodyWithLimit(req);
  if (!body.ok) return NextResponse.json({ error: body.error }, { status: 400 });

  const parsed = validateGenerateRequest(body.data);
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 });

  const { candidate_id, content_type, topic, tone } = parsed.data;

  // Hard cap at output level too (cost + determinism)
  const maxOut = maxOutputCharsFor(content_type);

  const diag = {
    attempted: { MSI: false, OpenAI: false },
    MSI: { ok: false as boolean, error: null as string | null },
    OpenAI: { ok: false as boolean, error: null as string | null },
    configured: { Actuation: false, Volume: false },
    source_engine: null as "MSI" | "OpenAI" | null,
  };

  // Safe config flags (no secrets)
  diag.configured.Actuation = Boolean(
    (process.env.MARLENY_AI_ENDPOINT || process.env.MARLENY_ENDPOINT || process.env.MARLENY_API_URL) &&
      (process.env.MARLENY_AI_API_KEY || process.env.MARLENY_API_KEY || process.env.MARLENY_TOKEN),
  );
  diag.configured.Volume = hasOpenAiConfig();

  diag.attempted.MSI = true;
  const msi = await callMarlenyAI({
    candidateId: candidate_id,
    contentType: content_type,
    topic,
    tone,
  });

  let textResult: string | null = null;
  let lastError: string | null = null;

  if (msi.ok) {
    textResult = msi.text;
    diag.MSI.ok = true;
    diag.source_engine = "MSI";
  } else {
    lastError = msi.error;
    diag.MSI.ok = false;
    diag.MSI.error = msi.error;
    // Failover to OpenAI when configured.
    if (hasOpenAiConfig()) {
      diag.attempted.OpenAI = true;
      let candidateContext = "";
      try {
        // Best-effort: enrich with candidate bio/proposals using admin client (service role).
        // This endpoint is token-only server-to-server, so service-role is safe and avoids cookie dependency.
        const supabase = await createSupabaseServerClient();
        if (supabase) {
          const { data: pol } = await supabase
            .from("politicians")
            .select("id,slug,name,office,region,party,ballot_number,biography,proposals")
            .or(`id.eq.${candidate_id},slug.eq.${candidate_id}`)
            .maybeSingle();
          if (pol) {
            candidateContext = [
              `Candidato: ${pol.name} (${pol.office})`,
              `Región: ${pol.region}`,
              pol.party ? `Partido: ${pol.party}` : "",
              pol.ballot_number ? `Número tarjetón: ${pol.ballot_number}` : "",
              "",
              "Biografía (extracto):",
              String(pol.biography || "").slice(0, 1200),
              "",
              "Propuestas (extracto):",
              String(pol.proposals || "").slice(0, 1600),
            ]
              .filter(Boolean)
              .join("\n");
          }
        }
      } catch {
        // ignore (keep minimal)
      }

      const format =
        content_type === "proposal"
          ? "Formato: 4–6 bloques cortos con título y 2–3 líneas por bloque."
          : content_type === "blog"
            ? "Formato: (1) título sugerido, (2) resumen en 5–7 líneas, (3) esquema con 6–10 bullets."
            : [
                "IMPORTANTE: Responde SOLO en JSON válido (sin markdown).",
                "JSON schema:",
                "{",
                '  "base": string,',
                '  "variants": { "facebook": string, "instagram": string, "x": string },',
                '  "image_keywords": string[]',
                "}",
              ].join("\n");

      const prompt = [
        "Generación bajo control (admin).",
        candidateContext ? "" : `CandidateID: ${candidate_id}`,
        candidateContext,
        "",
        `Tipo: ${content_type}`,
        `Tema: ${topic}`,
        tone ? `Tono: ${tone}` : "Tono: sobrio y humano",
        format,
        "Reglas: verificable, sin inventar datos, sin ataques personales, sin urgencia falsa.",
      ]
        .filter(Boolean)
        .join("\n");

      const model = (process.env.OPENAI_MODEL?.trim() || "gpt-4o-mini").trim();
      const oa = await callOpenAiOnce({ model, prompt, maxOutputChars: maxOut });
      if (oa.ok) {
        textResult = oa.text;
        diag.OpenAI.ok = true;
        diag.source_engine = "OpenAI";
      } else {
        lastError = oa.error;
        diag.OpenAI.ok = false;
        diag.OpenAI.error = oa.error;
      }
    }
  }

  if (!textResult) {
    const status = lastError === "disabled" || lastError === "not_configured" ? 503 : 502;
    return NextResponse.json(
      {
        error: lastError || "upstream_error",
        meta: {
          source_engine: diag.source_engine,
          engines: {
            Actuation: diag.attempted.MSI ? (diag.MSI.ok ? "OK" : diag.MSI.error) : "not_attempted",
            Volume: diag.attempted.OpenAI ? (diag.OpenAI.ok ? "OK" : diag.OpenAI.error) : "not_attempted",
          },
          configured: diag.configured,
          note:
            "Este endpoint es server-to-server. El panel admin usa wrappers /api/admin/automation/* (sin exponer secretos).",
        },
      },
      { status },
    );
  }

  const text = textResult.slice(0, maxOut);
  const createdAt = new Date().toISOString();

  // Phase 2.2: for social content, Marleny returns JSON with base + variants + image_keywords.
  let response: GenerateResponse;
  if (content_type === "social") {
    let base = text;
    let variants: GenerateResponse["variants"] | undefined;
    let image_keywords: string[] | undefined;

    try {
      const parsed = JSON.parse(text) as unknown;
      if (parsed && typeof parsed === "object") {
        const obj = parsed as Record<string, unknown>;
        const baseCandidate = typeof obj.base === "string" ? obj.base.trim() : "";
        const v = typeof obj.variants === "object" && obj.variants !== null ? (obj.variants as Record<string, unknown>) : null;
        const fb = v && typeof v.facebook === "string" ? v.facebook.trim() : "";
        const ig = v && typeof v.instagram === "string" ? v.instagram.trim() : "";
        const x = v && typeof v.x === "string" ? v.x.trim() : "";
        const kws = Array.isArray(obj.image_keywords)
          ? (obj.image_keywords.filter((k) => typeof k === "string").map((k) => k.trim()).filter(Boolean) as string[])
          : [];

        if (baseCandidate) base = baseCandidate.slice(0, 700);
        if (fb && ig && x) {
          variants = {
            facebook: fb.slice(0, 900),
            instagram: ig.slice(0, 900),
            x: x.slice(0, 280),
          };
        }
        if (kws.length) image_keywords = kws.slice(0, 12);
      }
    } catch {
      // fallback to plain text
    }

    response = {
      generated_text: base.slice(0, maxOut),
      content_type,
      candidate_id,
      token_estimate: estimateTokens(base),
      created_at: createdAt,
      ...(variants ? { variants } : {}),
      ...(image_keywords ? { image_keywords } : {}),
    };
  } else {
    response = {
      generated_text: text,
      content_type,
      candidate_id,
      token_estimate: estimateTokens(text),
      created_at: createdAt,
    };
  }

  return NextResponse.json(response);
}

