import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { fetchTopGdeltArticle } from "@/lib/news/gdelt";
import { callMarlenyAI } from "@/lib/si/marleny-ai/client";
import { submitToN8n } from "@/lib/automation/n8n";
import { getSiteUrlString } from "@/lib/site";

export const runtime = "nodejs";

function requireCronAuth(req: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const auth = req.headers.get("authorization") ?? "";
  return auth === `Bearer ${secret}`;
}

function slugify(input: string): string {
  const base = input
    .toLowerCase()
    .normalize("NFKD")
    .replaceAll(/[\u0300-\u036f]/g, "")
    .replaceAll(/[^a-z0-9]+/g, "-")
    .replaceAll(/^-+|-+$/g, "");
  return base.length ? base.slice(0, 64) : `post-${Date.now()}`;
}

export async function GET(_req: Request, ctx: { params: Promise<{ candidateId: string }> }) {
  const req = _req;
  if (!requireCronAuth(req)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { candidateId } = await ctx.params;
  const candidate_id = String(candidateId || "").trim();
  if (!candidate_id) return NextResponse.json({ error: "candidate_id_required" }, { status: 400 });

  const admin = createSupabaseAdminClient();
  if (!admin) return NextResponse.json({ error: "not_configured" }, { status: 503 });

  const { data: pol } = await admin
    .from("politicians")
    .select("id,slug,name,office,region,party,ballot_number,auto_publish_enabled")
    .eq("id", candidate_id)
    .maybeSingle();
  if (!pol) return NextResponse.json({ error: "not_found" }, { status: 404 });

  const regionQuery =
    pol.region && pol.region.toLowerCase().includes("meta")
      ? "Meta Colombia Villavicencio"
      : pol.region && pol.region.toLowerCase().includes("nacional")
        ? "Colombia"
        : `${pol.region} Colombia`;

  const article = await fetchTopGdeltArticle(regionQuery);

  const topicParts = [
    "Centro informativo ciudadano: redacta una nota breve y verificable basada en un titular de actualidad.",
    "Reglas:",
    "- Máximo ~30 líneas (párrafos cortos).",
    "- Sin miedo, sin ataques personales, sin urgencia falsa.",
    "- Enfócate en seguridad proactiva y soluciones institucionales cuando aplique.",
    "- Incluye 1 línea final: “Fuente:” con un enlace si se proporciona.",
    "",
    `Candidato: ${pol.name} (${pol.office})`,
    `Región: ${pol.region}`,
    pol.ballot_number ? `Número: ${pol.ballot_number}` : "",
    article ? `Titular: ${article.title}` : "Titular: (sin titular; redacta un resumen cívico del día para la región)",
    article ? `Enlace: ${article.url}` : "",
    "",
    "Incluye:",
    "- Título sugerido",
    "- Cuerpo",
    "- 5 keywords SEO (una por línea, prefijo “SEO:”)",
  ].filter(Boolean);

  const ai = await callMarlenyAI({
    candidateId: pol.id,
    contentType: "blog",
    topic: topicParts.join("\n"),
    tone: "sereno, institucional, Colombia",
  });
  if (!ai.ok) {
    const status = ai.error === "disabled" || ai.error === "not_configured" ? 503 : 502;
    return NextResponse.json({ ok: false, error: ai.error }, { status });
  }

  const created_at = new Date().toISOString();
  const slug = slugify(`${pol.slug}-${article?.seendate ?? created_at}-${article?.title ?? ""}`);

  // Store draft for admin review.
  await admin.from("ai_drafts").insert({
    candidate_id: pol.id,
    content_type: "blog",
    topic: article?.title ?? `Actualidad: ${regionQuery}`,
    tone: "sereno, institucional",
    generated_text: ai.text,
    variants: {},
    metadata: {
      source: "gdelt",
      source_url: article?.url ?? null,
      region_query: regionQuery,
    },
    image_keywords: null,
    source: "web",
    status: "pending_review",
    created_at,
    updated_at: created_at,
  });

  // If auto publish is enabled, publish to citizen center and (optionally) forward a social teaser to n8n.
  if (pol.auto_publish_enabled === true) {
    const titleLine = ai.text.split("\n").find((l) => l.trim().length > 0) ?? `Centro informativo · ${pol.name}`;
    const excerpt = ai.text.split("\n").slice(0, 6).join("\n").slice(0, 420);

    await admin.from("citizen_news_posts").insert({
      candidate_id: pol.id,
      slug,
      title: titleLine.slice(0, 160),
      excerpt,
      body: ai.text,
      media_urls: null,
      source_url: article?.url ?? null,
      status: "published",
      published_at: created_at,
      created_at,
    });

    // Teaser for social networks → n8n (if enabled there).
    const publicLink = `${getSiteUrlString()}/centro-informativo#${slug}`;
    const base = `${titleLine}\n\nLee el análisis completo en el Centro Informativo Ciudadano:\n${publicLink}`.slice(0, 700);
    await submitToN8n({
      candidate_id: pol.id,
      content_type: "social",
      generated_text: base,
      token_estimate: 0,
      created_at,
      source: "web",
      metadata: {
        origin: "cron_auto_publish",
        blog_slug: slug,
        source_url: article?.url ?? null,
      },
    });
  }

  return NextResponse.json({ ok: true });
}

