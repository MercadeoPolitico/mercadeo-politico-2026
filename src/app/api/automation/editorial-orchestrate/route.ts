import { NextResponse } from "next/server";
import { readJsonBodyWithLimit } from "@/lib/automation/readBody";
import { isAdminSession } from "@/lib/auth/adminSession";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { fetchTopGdeltArticle } from "@/lib/news/gdelt";
import { callMarlenyAI } from "@/lib/si/marleny-ai/client";
import { openAiJson } from "@/lib/automation/openai";

export const runtime = "nodejs";

function logSupabaseError(args: { requestId: string; step: string; error: any }) {
  const e = args.error as { message?: unknown; code?: unknown; details?: unknown; hint?: unknown };
  console.error("[editorial-orchestrate] supabase_error", {
    requestId: args.requestId,
    step: args.step,
    message: typeof e?.message === "string" ? e.message : null,
    code: typeof e?.code === "string" ? e.code : null,
    details: typeof e?.details === "string" ? e.details : null,
    hint: typeof e?.hint === "string" ? e.hint : null,
  });
}

function allowAutomation(req: Request): boolean {
  // Prefer MP26_AUTOMATION_TOKEN (n8n contract), fallback to legacy AUTOMATION_API_TOKEN.
  const apiToken = process.env.MP26_AUTOMATION_TOKEN ?? process.env.AUTOMATION_API_TOKEN;
  const headerToken = req.headers.get("x-automation-token") ?? "";
  if (!apiToken) return false;
  // Defensive: tolerate accidental whitespace/newline in stored env or header.
  return headerToken.trim() === String(apiToken).trim();
}

function newsQueryFor(office: string, region: string): string {
  // Keep queries conservative; GDELT will rank relevance.
  const off = office.toLowerCase();
  if (off.includes("senado")) {
    // National scope: Colombia; allow international only if it surfaces naturally as high relevance.
    return `Colombia ${region && region !== "Colombia" ? region : ""} seguridad`;
  }
  // Cámara: prioritize territory (Meta, etc). Allow national if it impacts the region (GDELT ranking helps).
  return `${region} Colombia seguridad`;
}

type Sentiment = "positive" | "negative" | "neutral";

type EngineOutput = {
  sentiment: Sentiment;
  seo_keywords: string[];
  master_editorial: string;
  platform_variants: {
    blog: string;
    facebook: string;
    x: string;
    reddit: string;
  };
  image_keywords?: string[];
};

type EngineName = "MSI" | "OpenAI";

type EngineResult =
  | { ok: true; engine: EngineName; ms: number; data: EngineOutput; raw: string }
  | { ok: false; engine: EngineName; ms: number; error: "timeout" | "disabled" | "not_configured" | "bad_response" | "upstream_error" | "failed" };

function nowMs(): number {
  return Date.now();
}

function isSentiment(v: unknown): v is Sentiment {
  return v === "positive" || v === "negative" || v === "neutral";
}

function cleanKeywords(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  return v
    .filter((x) => typeof x === "string")
    .map((s) => s.trim())
    .filter(Boolean)
    .slice(0, 16);
}

function safeJsonParse(text: string): unknown | null {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function extractEngineOutput(parsed: unknown): EngineOutput | null {
  if (!parsed || typeof parsed !== "object") return null;
  const p = parsed as Record<string, unknown>;
  const sentiment = p.sentiment;
  const seo_keywords = cleanKeywords(p.seo_keywords);
  const master_editorial = typeof p.master_editorial === "string" ? p.master_editorial.trim() : "";
  const pv = p.platform_variants;
  const platform_variants =
    pv && typeof pv === "object"
      ? {
          blog: typeof (pv as any).blog === "string" ? String((pv as any).blog).trim() : "",
          facebook: typeof (pv as any).facebook === "string" ? String((pv as any).facebook).trim() : "",
          x: typeof (pv as any).x === "string" ? String((pv as any).x).trim() : "",
          reddit: typeof (pv as any).reddit === "string" ? String((pv as any).reddit).trim() : "",
        }
      : { blog: "", facebook: "", x: "", reddit: "" };

  const image_keywords = cleanKeywords(p.image_keywords);

  if (!isSentiment(sentiment)) return null;
  if (seo_keywords.length < 3) return null;
  if (!master_editorial) return null;
  if (!platform_variants.blog || !platform_variants.facebook || !platform_variants.x) return null;

  return {
    sentiment,
    seo_keywords,
    master_editorial,
    platform_variants,
    image_keywords: image_keywords.length ? image_keywords : undefined,
  };
}

function baselineValidText(out: EngineOutput, candidateName: string): boolean {
  const t = `${out.master_editorial}\n${out.platform_variants.blog}`.toLowerCase();
  const name = candidateName.trim().toLowerCase();
  if (name.length >= 6 && !t.includes(name)) return false;
  // quick safety: reject obvious violent incitement / extremist calls
  const banned = [/maten\s+a\s+/i, /extermin/i, /limpieza\s+social/i, /golpe\s+de\s+estado/i, /incendiar/i];
  if (banned.some((r) => r.test(t))) return false;
  return true;
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

export async function POST(req: Request) {
  const url = new URL(req.url);
  const testMode = url.searchParams.get("test") === "true";

  const adminOk = await isAdminSession();
  if (!adminOk && !allowAutomation(req)) {
    // Disabled-by-default for public; n8n must send x-automation-token.
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const requestId = (() => {
    try {
      return crypto.randomUUID();
    } catch {
      return `req_${Date.now()}`;
    }
  })();

  const body = await readJsonBodyWithLimit(req);
  if (!body.ok) return NextResponse.json({ error: body.error }, { status: 400 });
  if (!body.data || typeof body.data !== "object") return NextResponse.json({ error: "invalid_body" }, { status: 400 });

  const b = body.data as Record<string, unknown>;
  const candidate_id = typeof b.candidate_id === "string" ? b.candidate_id.trim() : "";
  const max_items = typeof b.max_items === "number" ? b.max_items : 1;
  if (!candidate_id) return NextResponse.json({ error: "candidate_id_required" }, { status: 400 });
  if (max_items < 1 || max_items > 2) return NextResponse.json({ error: "max_items_invalid" }, { status: 400 });

  const adminProvidedNewsLinks = Array.isArray(b.news_links) ? (b.news_links.filter((x) => typeof x === "string") as string[]) : [];
  const adminEditorialNotes = typeof b.editorial_notes === "string" ? b.editorial_notes.trim() : "";

  const admin = createSupabaseAdminClient();
  if (!admin) return NextResponse.json({ error: "supabase_not_configured" }, { status: 503 });

  // Safe logging (no secrets)
  if (!adminOk) {
    console.info("[editorial-orchestrate] request", {
      requestId,
      candidate_id,
      max_items,
      testMode,
      actor: "automation",
    });
  } else {
    console.info("[editorial-orchestrate] request", { requestId, candidate_id, max_items, testMode, actor: "admin" });
  }

  const { data: polRow, error: polErr } = await admin
    .from("politicians")
    .select("id,slug,name,office,party,region,ballot_number,auto_blog_enabled,auto_publish_enabled,biography,proposals")
    .eq("id", candidate_id)
    .maybeSingle();
  if (polErr) {
    logSupabaseError({ requestId, step: "select_politician", error: polErr });
    return NextResponse.json({ error: "candidate_lookup_failed", request_id: requestId }, { status: 500 });
  }
  if (!polRow) return NextResponse.json({ error: "not_found" }, { status: 404 });
  if (polRow.auto_blog_enabled === false) return NextResponse.json({ ok: true, skipped: true, reason: "auto_blog_disabled" });
  const pol = polRow;

  console.info("[editorial-orchestrate] candidate_resolved", {
    requestId,
    candidate: { id: pol.id, slug: pol.slug, office: pol.office, region: pol.region },
  });

  // Admin-provided inputs (phase-1, backend-only):
  // - uploaded media references from Storage (no scraping)
  // These are included as preferred embed references in prompts/metadata.
  let recentMediaUrls: string[] = [];
  try {
    const { data: objs } = await admin.storage.from("politician-media").list(pol.id, {
      limit: 8,
      sortBy: { column: "created_at", order: "desc" },
    });
    recentMediaUrls =
      (objs ?? [])
        .filter((o) => o?.name && !String(o.name).endsWith("/"))
        .slice(0, 5)
        .map((o) => {
          const path = `${pol.id}/${o.name}`;
          const { data } = admin.storage.from("politician-media").getPublicUrl(path);
          return data.publicUrl;
        })
        .filter((u) => typeof u === "string" && u.startsWith("http"));
  } catch {
    // ignore (best-effort only)
  }

  // TEST MODE: generate exactly ONE draft, bypass external APIs.
  if (testMode) {
    // Guaranteed insert path: no external calls, fail loudly.
    const { data: inserted, error: insErr } = await admin
      .from("ai_drafts")
      .insert({
        candidate_id: pol.id,
        content_type: "blog",
        topic: "TEST DRAFT – DELETE",
        tone: "test",
        generated_text: "TEST DRAFT – DELETE\n\nThis is a static test draft created by /api/automation/editorial-orchestrate?test=true.",
        variants: {},
        metadata: { test: true, request_id: requestId },
        image_keywords: null,
        source: "n8n",
        status: "draft",
      })
      .select("id")
      .single();

    if (insErr || !inserted?.id) {
      if (insErr) logSupabaseError({ requestId, step: "insert_ai_draft_test", error: insErr });
      return NextResponse.json({ ok: false, error: "insert_failed", request_id: requestId }, { status: 500 });
    }

    const { count, error: countErr } = await admin.from("ai_drafts").select("*", { count: "exact", head: true });
    if (countErr) {
      logSupabaseError({ requestId, step: "count_ai_drafts_test", error: countErr });
      return NextResponse.json({ ok: false, error: "count_failed", request_id: requestId }, { status: 500 });
    }

    // Final assertion: ensure the inserted row is visible immediately.
    const { data: verifyRow, error: verifyErr } = await admin.from("ai_drafts").select("id").eq("id", inserted.id).maybeSingle();
    if (verifyErr) {
      logSupabaseError({ requestId, step: "verify_ai_draft_test", error: verifyErr });
      return NextResponse.json({ ok: false, error: "verify_failed", request_id: requestId }, { status: 500 });
    }
    if (!verifyRow?.id) {
      console.error("[editorial-orchestrate] assertion_failed_no_row_after_insert", { requestId, inserted_id: inserted.id });
      return NextResponse.json({ ok: false, error: "assertion_failed", request_id: requestId }, { status: 500 });
    }

    return NextResponse.json({ ok: true, id: inserted.id, total_drafts_count: count ?? null, test: true, request_id: requestId });
  }

  const query = newsQueryFor(pol.office, pol.region);

  // 1) Admin inputs first (if provided by automation caller)
  const hasAdminInputs = adminProvidedNewsLinks.length > 0 || adminEditorialNotes.length > 0 || recentMediaUrls.length > 0;

  // 2) News selection (GDELT) only if no admin-provided news links
  const article = adminProvidedNewsLinks.length ? null : await fetchTopGdeltArticle(query);

  // 2) If no news, fallback: last published post (for reframing)
  const { data: lastPublished } = await admin
    .from("citizen_news_posts")
    .select("id,title,body,source_url,published_at")
    .eq("candidate_id", pol.id)
    .eq("status", "published")
    .order("published_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const promptContext = [
    "Sistema editorial: crea contenido cívico para Colombia basado en noticia y en el programa del candidato.",
    "Obligatorio: RESPONDE SOLO JSON válido con el esquema exacto:",
    '{ "sentiment":"positive|negative|neutral", "seo_keywords": string[], "master_editorial": string, "platform_variants": { "blog": string, "facebook": string, "x": string, "reddit": string }, "image_keywords": string[] }',
    "",
    "Reglas globales (muy importantes):",
    "- Español (Colombia).",
    "- Informativo, propositivo, no agresivo, no propagandístico.",
    "- No inventar datos/cifras; no ataques personales; no urgencia falsa.",
    "- Debe ser coherente con la biografía y propuestas del candidato.",
    "- Incluye link relativo a /centro-informativo en facebook/x (sin URL absoluta).",
    "- Variants:",
    "  - blog: <= 30 líneas, incluye al final “Fuente:” (si existe) y “Hashtags:” (3+).",
    "  - facebook: 700-900 caracteres.",
    "  - x: <=280 o mini-hilo (3 partes) separadas por \\n\\n---\\n\\n.",
    "  - reddit: 6-10 líneas, tono analítico y abierto a discusión.",
    "",
    `Candidato: ${pol.name} (${pol.office})`,
    pol.party ? `Partido: ${pol.party}` : "",
    `Región: ${pol.region}`,
    pol.ballot_number ? `Número tarjetón: ${pol.ballot_number}` : "",
    "",
    "Biografía (extracto):",
    String(pol.biography || "").slice(0, 1500),
    "",
    "Propuestas / programa (extracto):",
    String(pol.proposals || "").slice(0, 2200),
    "",
    "Media disponible (solo usar estas referencias; NO scraping):",
    recentMediaUrls.length ? recentMediaUrls.map((u) => `- ${u}`).join("\n") : "- (sin archivos recientes)",
    "",
    hasAdminInputs ? "Admin inputs (prioridad):" : "Admin inputs (ninguno)",
    adminEditorialNotes ? `Notas editoriales admin: ${adminEditorialNotes}` : "",
    adminProvidedNewsLinks.length ? `Enlaces de noticia admin:\n${adminProvidedNewsLinks.map((u) => `- ${u}`).join("\n")}` : "",
    "",
    article ? "Noticia automática (GDELT):" : "No hay noticia automática (GDELT) o se priorizaron inputs admin.",
    article ? `Titular: ${article.title}` : "",
    article ? `URL: ${article.url}` : "",
    article ? `Fecha: ${article.seendate}` : "",
    "",
    !article && lastPublished
      ? "Fallback: si no hay noticia, reescribe la nota anterior con nuevo título, enfoque y SEO manteniendo verificabilidad:"
      : "",
    !article && lastPublished ? String(lastPublished.body).slice(0, 2400) : "",
  ]
    .filter(Boolean)
    .join("\n");

  async function runMsi(): Promise<EngineResult> {
    const started = nowMs();
    const topic = [
      "Genera el JSON del esquema solicitado.",
      "No incluyas explicaciones fuera del JSON.",
      "",
      promptContext,
    ].join("\n");

    const wrapped = await withTimeout(
      callMarlenyAI({
        candidateId: pol.id,
        contentType: "blog",
        topic,
        tone: "editorial sobrio, institucional, humano",
      }),
      25000,
    );

    const ms = nowMs() - started;
    if (!wrapped.ok) return { ok: false, engine: "MSI", ms, error: "timeout" };
    const r = wrapped.value;
    if (!r?.ok) return { ok: false, engine: "MSI", ms, error: "failed" };
    const raw = String(r.text ?? "");
    const parsed = safeJsonParse(raw);
    const data = extractEngineOutput(parsed);
    if (!data) return { ok: false, engine: "MSI", ms, error: "bad_response" };
    if (!baselineValidText(data, pol.name)) return { ok: false, engine: "MSI", ms, error: "bad_response" };
    return { ok: true, engine: "MSI", ms, data, raw };
  }

  async function runOpenAi(): Promise<EngineResult> {
    const started = nowMs();
    const wrapped = await withTimeout(
      openAiJson<EngineOutput>({
        task: "editorial_full_draft",
        system:
          "Eres un editor cívico para Colombia. Debes producir un borrador editorial y variantes por plataforma. " +
          "No inventes datos, no ataques personas, no propaganda. Responde SOLO JSON con el esquema indicado.",
        user: promptContext,
      }),
      20000,
    );
    const ms = nowMs() - started;
    if (!wrapped.ok) return { ok: false, engine: "OpenAI", ms, error: "timeout" };
    const r = wrapped.value;
    if (!r?.ok) return { ok: false, engine: "OpenAI", ms, error: (r?.error as any) ?? "failed" };
    const data = extractEngineOutput(r.data);
    if (!data) return { ok: false, engine: "OpenAI", ms, error: "bad_response" };
    if (!baselineValidText(data, pol.name)) return { ok: false, engine: "OpenAI", ms, error: "bad_response" };
    return { ok: true, engine: "OpenAI", ms, data, raw: JSON.stringify(r.data) };
  }

  // Run both in parallel and pick first valid response.
  const msiP = runMsi();
  const oaP = runOpenAi();

  const pending: Array<Promise<EngineResult>> = [msiP, oaP];
  const results: Record<EngineName, EngineResult | null> = { MSI: null, OpenAI: null };

  let winner: EngineResult & { ok: true } | null = null;
  while (pending.length) {
    // eslint-disable-next-line no-await-in-loop
    const r = await Promise.race(pending);
    results[r.engine] = r;
    const idx = pending.findIndex((p) => p === (r.engine === "MSI" ? msiP : oaP));
    if (idx >= 0) pending.splice(idx, 1);
    if (r.ok && !winner) {
      winner = r as any;
      break;
    }
  }

  const msi = results.MSI;
  const oa = results.OpenAI;

  if (!winner) {
    console.warn("[editorial-orchestrate] no_valid_engine_output", {
      requestId,
      candidate_id: pol.id,
      msi: msi?.ok ? { ok: true, ms: (msi as any).ms } : { ok: false, ms: msi?.ms, error: msi?.error },
      openai: oa?.ok ? { ok: true, ms: (oa as any).ms } : { ok: false, ms: oa?.ms, error: oa?.error },
    });
    return NextResponse.json(
      {
        ok: false,
        error: "no_valid_engine_output",
        request_id: requestId,
        engines: {
          MSI: msi?.ok ? { ok: true, ms: msi.ms } : { ok: false, ms: msi?.ms ?? null, error: msi?.error ?? null },
          OpenAI: oa?.ok ? { ok: true, ms: oa.ms } : { ok: false, ms: oa?.ms ?? null, error: oa?.error ?? null },
        },
      },
      { status: 502 },
    );
  }

  const arbitration_reason = (() => {
    if (winner.engine === "MSI") return "first_valid_response";
    // winner is OpenAI
    if (msi && !msi.ok && msi.error === "timeout") return "msi_timeout";
    if (msi && !msi.ok && msi.error !== "timeout") return "msi_error";
    return "openai_faster";
  })();

  const metadata = {
    orchestrator: { source: "n8n", version: "v2_arbiter" },
    request_id: requestId,
    source_engine: winner.engine,
    arbitration_reason,
    response_times_ms: {
      MSI: msi?.ms ?? null,
      OpenAI: oa?.ms ?? null,
    },
    engine_results: {
      MSI: msi?.ok ? { ok: true } : { ok: false, error: msi?.error ?? null },
      OpenAI: oa?.ok ? { ok: true } : { ok: false, error: oa?.error ?? null },
    },
    candidate: { id: pol.id, slug: pol.slug, office: pol.office, region: pol.region, ballot_number: pol.ballot_number ?? null },
    admin_inputs: {
      provided_news_links: adminProvidedNewsLinks.length ? adminProvidedNewsLinks.slice(0, 10) : [],
      editorial_notes: adminEditorialNotes || null,
      recent_media_urls: recentMediaUrls,
    },
    news: article
      ? { provider: "gdelt", title: article.title, url: article.url, seendate: article.seendate, query }
      : lastPublished
        ? { provider: "fallback", from: "citizen_news_posts", title: lastPublished.title, source_url: lastPublished.source_url }
        : { provider: "none", query },
    sentiment: winner.data.sentiment,
    seo_keywords: winner.data.seo_keywords,
    master_editorial: winner.data.master_editorial,
  };

  const topic = article ? `Noticias: ${article.title}` : "Noticias: (sin titular; reescritura editorial)";

  // Persist: generated_text is the BLOG variant (Centro Informativo Ciudadano).
  // Variants: keep required keys for existing admin UI (facebook/instagram/x), plus reddit/blog for automation.
  const variantsJson = {
    blog: winner.data.platform_variants.blog,
    facebook: winner.data.platform_variants.facebook,
    instagram: "",
    x: winner.data.platform_variants.x,
    reddit: winner.data.platform_variants.reddit,
  };

  const image_keywords =
    winner.data.image_keywords && winner.data.image_keywords.length ? winner.data.image_keywords.slice(0, 12) : winner.data.seo_keywords.slice(0, 12);

  const { data: inserted, error: insErr } = await admin
    .from("ai_drafts")
    .insert({
      candidate_id: pol.id,
      content_type: "blog",
      topic,
      tone: "orchestrated_arbiter",
      generated_text: winner.data.platform_variants.blog,
      variants: variantsJson,
      metadata,
      image_keywords,
      source: "n8n",
      status: "draft",
    })
    .select("id")
    .single();

  if (insErr || !inserted?.id) {
    if (insErr) logSupabaseError({ requestId, step: "insert_ai_draft", error: insErr });
    return NextResponse.json({ ok: false, error: "db_error", request_id: requestId }, { status: 500 });
  }

  const { data: verifyRow, error: verifyErr } = await admin.from("ai_drafts").select("id").eq("id", inserted.id).maybeSingle();
  if (verifyErr) {
    logSupabaseError({ requestId, step: "verify_ai_draft", error: verifyErr });
    return NextResponse.json({ ok: false, error: "verify_failed", request_id: requestId }, { status: 500 });
  }
  if (!verifyRow?.id) {
    console.error("[editorial-orchestrate] assertion_failed_no_row_after_insert", { requestId, inserted_id: inserted.id });
    return NextResponse.json({ ok: false, error: "assertion_failed", request_id: requestId }, { status: 500 });
  }

  return NextResponse.json({
    ok: true,
    id: inserted.id,
    source_engine: winner.engine,
    arbitration_reason,
    article_found: Boolean(article) || adminProvidedNewsLinks.length > 0,
    request_id: requestId,
  });
}

