import { NextResponse } from "next/server";
import { readJsonBodyWithLimit } from "@/lib/automation/readBody";
import { isAdminSession } from "@/lib/auth/adminSession";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { fetchTopGdeltArticle } from "@/lib/news/gdelt";
import { callMarlenyAI } from "@/lib/si/marleny-ai/client";
import { openAiJson } from "@/lib/automation/openai";

export const runtime = "nodejs";

function allowAutomation(req: Request): boolean {
  const apiToken = process.env.AUTOMATION_API_TOKEN;
  const headerToken = req.headers.get("x-automation-token") ?? "";
  if (!apiToken) return false;
  return headerToken === apiToken;
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

type OpenAiNewsAnalysis = {
  sentiment: "positive" | "negative" | "neutral";
  summary: string;
  seo_keywords: string[];
};

type OpenAiVariants = {
  facebook: string;
  x: string;
  reddit: string;
  image_keywords: string[];
};

export async function POST(req: Request) {
  const adminOk = await isAdminSession();
  if (!adminOk && !allowAutomation(req)) {
    // Disabled-by-default for public; n8n must send x-automation-token.
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const body = await readJsonBodyWithLimit(req);
  if (!body.ok) return NextResponse.json({ error: body.error }, { status: 400 });
  if (!body.data || typeof body.data !== "object") return NextResponse.json({ error: "invalid_body" }, { status: 400 });

  const b = body.data as Record<string, unknown>;
  const candidate_id = typeof b.candidate_id === "string" ? b.candidate_id.trim() : "";
  const max_items = typeof b.max_items === "number" ? b.max_items : 1;
  if (!candidate_id) return NextResponse.json({ error: "candidate_id_required" }, { status: 400 });
  if (max_items < 1 || max_items > 2) return NextResponse.json({ error: "max_items_invalid" }, { status: 400 });

  const admin = createSupabaseAdminClient();
  if (!admin) return NextResponse.json({ error: "supabase_not_configured" }, { status: 503 });

  const { data: pol } = await admin
    .from("politicians")
    .select("id,slug,name,office,party,region,ballot_number,auto_blog_enabled,auto_publish_enabled,biography,proposals")
    .eq("id", candidate_id)
    .maybeSingle();
  if (!pol) return NextResponse.json({ error: "not_found" }, { status: 404 });
  if (pol.auto_blog_enabled === false) return NextResponse.json({ ok: true, skipped: true, reason: "auto_blog_disabled" });

  // 1) News selection (GDELT)
  const query = newsQueryFor(pol.office, pol.region);
  const article = await fetchTopGdeltArticle(query);

  // 2) If no news, fallback: last published post (for reframing)
  const { data: lastPublished } = await admin
    .from("citizen_news_posts")
    .select("id,title,body,source_url,published_at")
    .eq("candidate_id", pol.id)
    .eq("status", "published")
    .order("published_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  // 3) OpenAI analysis (optional)
  const openAiAnalysis = await openAiJson<OpenAiNewsAnalysis>({
    task: "news_analyze",
    system:
      "Eres un analista de noticias. Tu tarea es solo: sentimiento (positive/negative/neutral), resumen factual y keywords SEO. " +
      "PROHIBIDO: sugerir narrativa política, apoyar candidatos, persuadir, o inventar datos. Responde SOLO JSON.",
    user: [
      `Contexto país/región: Colombia; Región foco: ${pol.region}`,
      `Cargo: ${pol.office}`,
      article ? `Titular: ${article.title}` : "Titular: (no disponible)",
      article ? `URL: ${article.url}` : "",
      article ? `Fecha: ${article.seendate}` : "",
      "",
      "Devuelve JSON con el esquema:",
      '{ "sentiment": "positive|negative|neutral", "summary": string, "seo_keywords": string[] }',
      "Reglas:",
      "- seo_keywords: 8-14 keywords, relevantes para Colombia (y región si aplica), sin hashtags.",
      "- summary: 3-6 frases, sin opinión política.",
    ]
      .filter(Boolean)
      .join("\n"),
  });

  // 4) Marleny SI: political framing + master editorial text (source of truth)
  const marlenyTopic = [
    "Tarea: redacta un texto editorial cívico basado en noticia, con coherencia política y ética.",
    "Reglas editoriales:",
    "- Español (Colombia).",
    "- Informativo, propositivo, no agresivo, no propagandístico.",
    "- No inventes cifras/datos; no ataques personas; no urgencia falsa.",
    "- Máximo ~30 líneas.",
    "- Al final incluye 1 línea: “Fuente:” + enlace si existe.",
    "- Al final incluye 1 línea: “Hashtags:” + 3 hashtags relevantes (no polarizantes).",
    "- Incluye 5 líneas “SEO:” (una keyword por línea) usando tendencia cuando sea posible.",
    "",
    `Candidato: ${pol.name} (${pol.office})`,
    pol.party ? `Partido: ${pol.party}` : "",
    `Región: ${pol.region}`,
    pol.ballot_number ? `Número: ${pol.ballot_number}` : "",
    "",
    "Biografía (resumen):",
    String(pol.biography || "").slice(0, 1500),
    "",
    "Programa / Propuestas (extracto):",
    String(pol.proposals || "").slice(0, 2000),
    "",
    article ? "Noticia seleccionada (GDELT):" : "No se encontró noticia nueva relevante.",
    article ? `Titular: ${article.title}` : "",
    article ? `URL: ${article.url}` : "",
    article ? `Fecha: ${article.seendate}` : "",
    openAiAnalysis.ok ? "" : "Nota: análisis OpenAI no disponible; procede con criterio cívico.",
    openAiAnalysis.ok ? `Sentimiento (OpenAI): ${openAiAnalysis.data.sentiment}` : "",
    openAiAnalysis.ok ? `Resumen (OpenAI): ${openAiAnalysis.data.summary}` : "",
    openAiAnalysis.ok ? `SEO keywords (OpenAI): ${(openAiAnalysis.data.seo_keywords ?? []).join(", ")}` : "",
    "",
    !article && lastPublished
      ? "Reescritura: toma la nota anterior como base, cambia título/enfoque y SEO, mantén verificabilidad."
      : "",
    !article && lastPublished ? `Nota anterior:\n${String(lastPublished.body).slice(0, 2500)}` : "",
  ]
    .filter(Boolean)
    .join("\n");

  const marleny = await callMarlenyAI({
    candidateId: pol.id,
    contentType: "blog",
    topic: marlenyTopic,
    tone: "editorial sobrio, institucional, humano",
  });

  if (!marleny.ok) {
    const status = marleny.error === "disabled" || marleny.error === "not_configured" ? 503 : 502;
    return NextResponse.json({ error: "marleny_failed", reason: marleny.error }, { status });
  }

  // 5) OpenAI: multi-platform adaptation (optional)
  const variants = await openAiJson<OpenAiVariants>({
    task: "platform_variants",
    system:
      "Eres un editor de estilo por plataforma. No cambias el significado político ni agregas hechos nuevos. " +
      "No persuades ni atacas. Solo adaptas formato/longitud. Responde SOLO JSON.",
    user: [
      `Cargo: ${pol.office}; Región: ${pol.region}`,
      "",
      "Texto maestro (NO cambiar sentido):",
      marleny.text,
      "",
      "Devuelve JSON con el esquema:",
      '{ "facebook": string, "x": string, "reddit": string, "image_keywords": string[] }',
      "Reglas:",
      "- facebook: 700-900 caracteres, CTA suave al final con link a /centro-informativo (sin URL absoluta).",
      "- x: 1 post (<=280) o mini-hilo (3 tweets separados por \\n\\n---\\n\\n).",
      "- reddit: tono analítico y abierto a discusión (6-10 líneas).",
      "- image_keywords: 6-12 keywords para buscar imágenes (solo texto; no scraping).",
      "- No inventar datos; no mencionar OpenAI; no mencionar tecnología.",
    ].join("\n"),
  });

  const variantsJson = variants.ok
    ? {
        facebook: variants.data.facebook ?? "",
        x: variants.data.x ?? "",
        reddit: variants.data.reddit ?? "",
      }
    : {};

  const image_keywords = variants.ok ? (variants.data.image_keywords ?? []).filter((k) => typeof k === "string").slice(0, 12) : null;

  const metadata = {
    orchestrator: { source: "n8n", version: "v1" },
    candidate: { id: pol.id, slug: pol.slug, office: pol.office, region: pol.region, ballot_number: pol.ballot_number ?? null },
    news: article
      ? { provider: "gdelt", title: article.title, url: article.url, seendate: article.seendate, query }
      : lastPublished
        ? { provider: "fallback", from: "citizen_news_posts", title: lastPublished.title, source_url: lastPublished.source_url }
        : { provider: "none", query },
    openai: openAiAnalysis.ok ? openAiAnalysis.data : { enabled: false },
    flags: { auto_blog_enabled: pol.auto_blog_enabled, auto_publish_enabled: pol.auto_publish_enabled },
  };

  const topic = article ? `Noticias: ${article.title}` : "Noticias: (sin titular; reescritura editorial)";

  const { data: inserted, error: insErr } = await admin
    .from("ai_drafts")
    .insert({
      candidate_id: pol.id,
      content_type: "blog",
      topic,
      tone: "orchestrated",
      generated_text: marleny.text,
      variants: variantsJson,
      metadata,
      image_keywords,
      source: "n8n",
      status: "pending_review",
    })
    .select("id")
    .single();

  if (insErr || !inserted?.id) return NextResponse.json({ error: "db_error" }, { status: 500 });

  return NextResponse.json({
    ok: true,
    id: inserted.id,
    used_openai: openAiAnalysis.ok && variants.ok,
    article_found: Boolean(article),
  });
}

