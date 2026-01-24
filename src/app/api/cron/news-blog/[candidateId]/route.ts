import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { fetchTopGdeltArticle } from "@/lib/news/gdelt";
import { callMarlenyAI } from "@/lib/si/marleny-ai/client";
import { submitToN8n } from "@/lib/automation/n8n";
import { getSiteUrlString } from "@/lib/site";
import { pickWikimediaImage } from "@/lib/media/wikimedia";

export const runtime = "nodejs";

function normalizeToken(v: unknown): string {
  const s = String(v ?? "").trim();
  if (!s) return "";
  if ((s.startsWith('"') && s.endsWith('"')) || (s.startsWith("'") && s.endsWith("'"))) return s.slice(1, -1).trim();
  return s.endsWith("\\n") ? s.slice(0, -2).trim() : s;
}

function requireCronAuth(req: Request): boolean {
  const secret = normalizeToken(process.env.CRON_SECRET);
  if (!secret) return false;
  const auth = normalizeToken(req.headers.get("authorization") ?? "");
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

function newsQueryFor(office: string, region: string): string {
  const off = String(office || "").toLowerCase();
  const reg = String(region || "").trim();

  // Senado: alcance nacional Colombia (internacional solo si GDELT lo rankea como relevante).
  if (off.includes("senado")) return "Colombia seguridad";

  // Cámara: prioriza departamento/territorio; si no hay región, cae a Colombia.
  if (!reg) return "Colombia seguridad";
  return `${reg} Colombia seguridad`;
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
    .select("id,slug,name,office,region,party,ballot_number,auto_publish_enabled,auto_blog_enabled,proposals")
    .eq("id", candidate_id)
    .maybeSingle();
  if (!pol) return NextResponse.json({ error: "not_found" }, { status: 404 });
  if (pol.auto_blog_enabled === false) return NextResponse.json({ ok: true, skipped: true });

  const regionQuery = newsQueryFor(pol.office, pol.region);

  const article = await fetchTopGdeltArticle(regionQuery);
  const { data: lastPublished } = await admin
    .from("citizen_news_posts")
    .select("id,slug,title,body,source_url,published_at")
    .eq("candidate_id", pol.id)
    .eq("status", "published")
    .order("published_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const topicParts = [
    "Centro informativo ciudadano: reescribe la noticia como artículo cívico, verificable y útil.",
    "Reglas:",
    "- Longitud: Ideal 450–650 palabras (mínimo 350, máximo 800).",
    "- Presentación atractiva con subtítulos. Primera línea: Título (<=120 caracteres).",
    "- Prioriza noticias por geolocalización del candidato (región/territorio).",
    "- Si hay un hecho nacional de alto impacto coherente con la propuesta del candidato, puedes usarlo.",
    "- Sin miedo, sin ataques personales, sin urgencia falsa.",
    "- Enfócate en seguridad proactiva y soluciones institucionales cuando aplique.",
    "- Debe explicar explícitamente cómo 1–2 ejes/puntos del programa del candidato aportan a prevenir/mitigar/solucionar (si es negativo) o potenciar (si es positivo).",
    "- Incluye 1 línea final: “Fuente:” con un enlace si se proporciona.",
    "- Agrega al final 3 hashtags relevantes para el incidente (línea 'Hashtags:').",
    "- Agrega al final 5 keywords SEO tendencia (línea 'SEO: ...').",
    "",
    `Candidato: ${pol.name} (${pol.office})`,
    `Región: ${pol.region}`,
    pol.ballot_number ? `Número: ${pol.ballot_number}` : "",
    pol.proposals && String(pol.proposals).trim().length ? `Propuesta (extracto):\n${String(pol.proposals).slice(0, 1200)}` : "",
    article ? `Titular: ${article.title}` : "",
    article ? `Enlace: ${article.url}` : "",
    !article && lastPublished ? "No hay noticia nueva relevante. Reescribe y actualiza la nota anterior, cambiando el título y el enfoque, manteniendo verificabilidad." : "",
    !article && lastPublished ? `Nota anterior:\n${String(lastPublished.body).slice(0, 1600)}` : "",
    "",
    "Incluye:",
    "- Título sugerido",
    "- Cuerpo",
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
  const { error: draftErr } = await admin.from("ai_drafts").insert({
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
  if (draftErr) return NextResponse.json({ ok: false, error: "insert_failed" }, { status: 500 });

  // If auto publish is enabled, publish to citizen center and (optionally) forward a social teaser to n8n.
  if (pol.auto_publish_enabled === true) {
    const titleLine = ai.text.split("\n").find((l) => l.trim().length > 0) ?? `Centro informativo · ${pol.name}`;
    const excerpt = ai.text.split("\n").slice(0, 6).join("\n").slice(0, 420);

    const imageQuery = `${(article?.title ?? titleLine).slice(0, 140)} ${pol.region} Colombia`;
    const pickedImage = await pickWikimediaImage({ query: imageQuery });
    const bodyWithCredits =
      pickedImage
        ? [
            ai.text.trim(),
            "",
            `Imagen (CC): ${pickedImage.image_url}`,
            `Crédito imagen: ${[pickedImage.attribution, pickedImage.author ? `Autor: ${pickedImage.author}` : null, pickedImage.license_short ? `Licencia: ${pickedImage.license_short}` : null, pickedImage.page_url ? `Fuente imagen: ${pickedImage.page_url}` : null].filter(Boolean).join(" · ")}`,
          ].join("\n")
        : ai.text;

    const { error: postErr } = await admin.from("citizen_news_posts").insert({
      candidate_id: pol.id,
      slug,
      title: titleLine.slice(0, 160),
      excerpt,
      body: bodyWithCredits,
      media_urls: pickedImage ? [pickedImage.image_url] : null,
      source_url: article?.url ?? null,
      status: "published",
      published_at: created_at,
      created_at,
    });
    if (postErr) return NextResponse.json({ ok: false, error: "publish_failed" }, { status: 500 });

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
        media: pickedImage
          ? {
              type: "image",
              image_url: pickedImage.image_url,
              page_url: pickedImage.page_url,
              license_short: pickedImage.license_short,
              attribution: pickedImage.attribution,
              author: pickedImage.author,
              source: pickedImage.source,
            }
          : null,
      },
    });
  }

  return NextResponse.json({ ok: true });
}

