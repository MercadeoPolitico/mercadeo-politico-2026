import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth/admin";
import { readJsonBodyWithLimit } from "@/lib/automation/readBody";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { fetchTopGdeltArticle } from "@/lib/news/gdelt";

export const runtime = "nodejs";

type ChatMsg = { role: "user" | "assistant"; content: string };

function isChatMsgArray(v: unknown): v is ChatMsg[] {
  return (
    Array.isArray(v) &&
    v.every(
      (m) =>
        m &&
        typeof m === "object" &&
        ("role" in m ? (m as any).role === "user" || (m as any).role === "assistant" : false) &&
        typeof (m as any).content === "string"
    )
  );
}

type EngineName = "MSI" | "OpenAI";
type EngineResult =
  | { ok: true; engine: EngineName; ms: number; reply: string }
  | { ok: false; engine: EngineName; ms: number; error: "timeout" | "not_configured" | "upstream_error" | "bad_response" };

function nowMs(): number {
  return Date.now();
}

function normalizeBaseUrl(raw: string): string {
  const base = (raw || "https://api.openai.com").trim().replace(/\/+$/, "");
  // Many users accidentally set OPENAI_BASE_URL to ".../v1". Normalize to host root.
  return base.endsWith("/v1") ? base.slice(0, -3) : base;
}

function withTimeout<T>(p: Promise<T>, ms: number): Promise<{ ok: true; value: T } | { ok: false; error: "timeout" }> {
  return new Promise((resolve) => {
    const t = setTimeout(() => resolve({ ok: false, error: "timeout" }), ms);
    p.then(
      (v) => {
        clearTimeout(t);
        resolve({ ok: true, value: v });
      },
      () => {
        clearTimeout(t);
        resolve({ ok: true, value: null as any });
      },
    );
  });
}

function nonEmptyReply(s: unknown): string | null {
  if (typeof s !== "string") return null;
  const t = s.trim();
  if (!t) return null;
  return t;
}

function pickEnv(nameA: string, nameB: string): string | null {
  const a = process.env[nameA];
  if (a && a.trim().length) return a.trim();
  const b = process.env[nameB];
  if (b && b.trim().length) return b.trim();
  return null;
}

async function callMsiChat(args: { candidateId: string; prompt: string }): Promise<EngineResult> {
  const started = nowMs();
  const endpoint =
    pickEnv("MARLENY_AI_ENDPOINT", "MARLENY_ENDPOINT") ??
    pickEnv("MARLENY_API_URL", "MARLENY_URL") ??
    pickEnv("MARLENY_BASE_URL", "MARLENY_HOST");
  const apiKey = pickEnv("MARLENY_AI_API_KEY", "MARLENY_API_KEY");
  if (!endpoint || !apiKey) return { ok: false, engine: "MSI", ms: nowMs() - started, error: "not_configured" };

  const wrapped = await withTimeout(
    fetch(endpoint, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        system:
          "Synthetic Intelligence (MSI). Responde como asistente para admins. " +
          "Sé sobrio, útil, verificable. Prohibido: desinformación, ataques personales, urgencia falsa.",
        user: args.prompt,
        constraints: { content_type: "chat", max_output_chars: 4000 },
      }),
      cache: "no-store",
    }),
    20000,
  );

  const ms = nowMs() - started;
  if (!wrapped.ok) return { ok: false, engine: "MSI", ms, error: "timeout" };
  const resp = wrapped.value;
  if (!resp?.ok) return { ok: false, engine: "MSI", ms, error: "upstream_error" };
  const data = (await resp.json().catch(() => null)) as any;
  const reply = nonEmptyReply(data?.text ?? data?.reply ?? data?.message);
  if (!reply) return { ok: false, engine: "MSI", ms, error: "bad_response" };
  return { ok: true, engine: "MSI", ms, reply };
}

async function callOpenAiChat(args: { prompt: string }): Promise<EngineResult> {
  const started = nowMs();
  const apiKey = process.env.OPENAI_API_KEY?.trim() || "";
  if (!apiKey) return { ok: false, engine: "OpenAI", ms: nowMs() - started, error: "not_configured" };

  const base = normalizeBaseUrl(process.env.OPENAI_BASE_URL?.trim() || "https://api.openai.com");
  const model = (process.env.OPENAI_MODEL?.trim() || "gpt-4o-mini").trim();

  const wrapped = await withTimeout(
    fetch(`${base}/v1/chat/completions`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        temperature: 0.2,
        messages: [
          {
            role: "system",
            content:
              "Synthetic Intelligence. Responde como asistente para admins. " +
              "Sé sobrio, útil, verificable. Prohibido: desinformación, ataques personales, urgencia falsa. " +
              "Responde en texto plano, con bullets cuando aplique.",
          },
          { role: "user", content: args.prompt },
        ],
      }),
      cache: "no-store",
    }),
    15000,
  );

  const ms = nowMs() - started;
  if (!wrapped.ok) return { ok: false, engine: "OpenAI", ms, error: "timeout" };
  const resp = wrapped.value;
  if (!resp?.ok) return { ok: false, engine: "OpenAI", ms, error: "upstream_error" };

  const json = (await resp.json().catch(() => null)) as any;
  const content = json?.choices?.[0]?.message?.content;
  const reply = nonEmptyReply(content);
  if (!reply) return { ok: false, engine: "OpenAI", ms, error: "bad_response" };
  return { ok: true, engine: "OpenAI", ms, reply };
}

function newsQueryFor(office: string, region: string): string {
  const off = office.toLowerCase();
  if (off.includes("senado")) return "Colombia seguridad";
  const reg = String(region ?? "").trim();
  return reg ? `${reg} Colombia seguridad` : "Colombia seguridad";
}

function normalizeRegionForNews(region: string): { region: string; cityHint: string | null } {
  const r = String(region ?? "").trim();
  if (!r) return { region: "Colombia", cityHint: null };
  const low = r.toLowerCase();
  // Avoid “Meta” ambiguity (Facebook/brand). Use explicit Dept + city hint.
  if (low === "meta" || low.includes("departamento del meta") || low.includes("meta (")) {
    return { region: "Departamento del Meta", cityHint: "Villavicencio" };
  }
  if (low.includes("colombia") || low.includes("nacional")) return { region: "Colombia", cityHint: null };
  return { region: r, cityHint: null };
}

async function pickTopNewsFor(office: string, region: string) {
  const norm = normalizeRegionForNews(region);
  const regionTrim = norm.region;
  const city = norm.cityHint;
  const queries = [
    city ? `${regionTrim} ${city} Colombia seguridad` : `${regionTrim} Colombia seguridad`,
    city ? `${regionTrim} ${city} orden público` : `${regionTrim} orden público`,
    `${regionTrim} extorsión`,
    `${regionTrim} vías terciarias`,
    `${regionTrim} economía`,
    `${regionTrim} turismo`,
    newsQueryFor(office, regionTrim || "Colombia"),
    "Colombia seguridad",
  ].filter((q) => q.trim().length > 0);

  for (const q of queries) {
    // eslint-disable-next-line no-await-in-loop
    const a = await fetchTopGdeltArticle(q);
    if (a) return { article: a, query: q };
  }
  return { article: null as any, query: queries[0] ?? "Colombia seguridad" };
}

export async function POST(req: Request) {
  await requireAdmin();

  const body = await readJsonBodyWithLimit(req);
  if (!body.ok) return NextResponse.json({ error: body.error }, { status: 400 });
  if (!body.data || typeof body.data !== "object") return NextResponse.json({ error: "invalid_body" }, { status: 400 });

  const b = body.data as Record<string, unknown>;
  const candidate_id = typeof b.candidate_id === "string" ? b.candidate_id.trim() : "";
  const messages = b.messages;
  if (!candidate_id) return NextResponse.json({ error: "candidate_id_required" }, { status: 400 });
  if (!isChatMsgArray(messages)) return NextResponse.json({ error: "invalid_messages" }, { status: 400 });

  // IMPORTANT:
  // Use the SSR cookie client (admin session) to avoid depending on SUPABASE_SERVICE_ROLE_KEY
  // in Vercel Production. Admin panel already works with cookies, so chat should too.
  const supabase = await createSupabaseServerClient();
  if (!supabase) return NextResponse.json({ error: "supabase_not_configured" }, { status: 503 });

  const { data: pol, error: polErr } = await supabase
    .from("politicians")
    .select("id,slug,name,office,party,region,ballot_number,biography,proposals")
    .or(`id.eq.${candidate_id},slug.eq.${candidate_id}`)
    .maybeSingle();

  if (polErr) return NextResponse.json({ error: "candidate_lookup_failed" }, { status: 500 });

  if (!pol) return NextResponse.json({ error: "candidate_not_found" }, { status: 404 });

  const transcript = messages
    .slice(-12)
    .map((m) => `${m.role === "user" ? "Usuario" : "Asistente"}: ${m.content}`)
    .join("\n\n");

  const prompt = [
    "Modo chat (admin). Responde breve, útil y segura.",
    "Si falta info, pide 1 dato concreto.",
    "",
    `Candidato: ${pol.name} (${pol.office})`,
    pol.party ? `Partido: ${pol.party}` : "",
    `Región: ${pol.region}`,
    pol.ballot_number ? `Número tarjetón: ${pol.ballot_number}` : "",
    "",
    "Biografía (extracto):",
    String(pol.biography || "").slice(0, 1200),
    "",
    "Propuestas (extracto):",
    String(pol.proposals || "").slice(0, 1600),
    "",
    "Conversación reciente:",
    transcript,
  ]
    .filter(Boolean)
    .join("\n");

  // Dual-engine arbiter (parallel), but OpenAI is preferred (user asked OpenAI first if needed).
  const msiP = callMsiChat({ candidateId: pol.id, prompt });
  const oaP = callOpenAiChat({ prompt });

  const results: Record<EngineName, EngineResult | null> = { MSI: null, OpenAI: null };

  // Prefer OpenAI: await OA first; if it fails, try MSI; otherwise fallback.
  // eslint-disable-next-line no-await-in-loop
  const oa = await oaP;
  results.OpenAI = oa;
  let winner: (EngineResult & { ok: true }) | null = oa.ok ? (oa as any) : null;

  if (!winner) {
    // eslint-disable-next-line no-await-in-loop
    const msi = await msiP;
    results.MSI = msi;
    if (msi.ok) winner = msi as any;
  } else {
    // We still want MSI diagnostics without blocking too long.
    void msiP.then((msi) => {
      results.MSI = msi;
    });
  }

  if (!winner) {
    // Continuity fallback (non-AI): still give a useful answer instead of "nada".
    // This keeps the admin governance surface operational even if both engines are down.
    const msiHasEndpoint = Boolean(
      pickEnv("MARLENY_AI_ENDPOINT", "MARLENY_ENDPOINT") || pickEnv("MARLENY_API_URL", "MARLENY_URL") || pickEnv("MARLENY_BASE_URL", "MARLENY_HOST")
    );
    const msiHasKey = Boolean(pickEnv("MARLENY_AI_API_KEY", "MARLENY_API_KEY"));
    const msiConfigured = msiHasEndpoint && msiHasKey;
    const openAiConfigured = Boolean(process.env.OPENAI_API_KEY && String(process.env.OPENAI_API_KEY).trim().length);

    const picked = await pickTopNewsFor(pol.office, pol.region);
    const article = picked.article as any;
    const reply = article?.title && article?.url
      ? [
          `No pude usar Synthetic Intelligence en este momento (motores con fallas o temporalmente inactivos).`,
          `Diagnóstico (safe): Actuation=${msiConfigured ? "OK" : `FALTA (${msiHasEndpoint ? "" : "endpoint "}${msiHasKey ? "" : "key"})`.trim()} · Volume=${openAiConfigured ? "OK" : "FALTA"}`,
          "",
          `Noticia sugerida para ${pol.name} (${pol.office}, ${pol.region}):`,
          `- Titular: ${article.title}`,
          `- Fuente: ${article.url}`,
          "",
          `Si quieres, dime: “redacta un borrador alineado a su propuesta” y lo intento de nuevo.`,
        ].join("\n")
      : [
          `No pude usar Synthetic Intelligence en este momento (motores con fallas o temporalmente inactivos).`,
          `Diagnóstico (safe): Actuation=${msiConfigured ? "OK" : `FALTA (${msiHasEndpoint ? "" : "endpoint "}${msiHasKey ? "" : "key"})`.trim()} · Volume=${openAiConfigured ? "OK" : "FALTA"}`,
          "",
          `Además, no encontré una noticia destacada en este momento para las consultas: ${picked.query}`,
          "Intenta de nuevo en 5–10 minutos o pega un enlace de noticia aquí para que lo use como input.",
        ].join("\n");

    return NextResponse.json({
      ok: true,
      reply,
      meta: {
        source_engine: "fallback_news",
        arbitration_reason: "no_engine_available",
        engines: {
          MSI: results.MSI?.ok ? { ok: true, ms: results.MSI.ms } : { ok: false, ms: results.MSI?.ms ?? null, error: results.MSI?.error ?? null },
          OpenAI: results.OpenAI?.ok
            ? { ok: true, ms: results.OpenAI.ms }
            : { ok: false, ms: results.OpenAI?.ms ?? null, error: results.OpenAI?.error ?? null },
        },
      },
    });
  }

  const arbitration_reason =
    winner.engine === "MSI"
      ? "first_valid_response"
      : results.MSI && !results.MSI.ok && results.MSI.error === "timeout"
        ? "msi_timeout"
        : results.MSI && !results.MSI.ok
          ? "msi_error"
          : "openai_preferred";

  return NextResponse.json({
    ok: true,
    reply: winner.reply,
    meta: {
      source_engine: winner.engine,
      arbitration_reason,
      response_times_ms: { MSI: results.MSI?.ms ?? null, OpenAI: results.OpenAI?.ms ?? null },
    },
  });
}

