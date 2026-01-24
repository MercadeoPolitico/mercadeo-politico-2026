import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth/admin";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { readJsonBodyWithLimit } from "@/lib/automation/readBody";
import { fetchTopGdeltArticle } from "@/lib/news/gdelt";
import { callMarlenyAI } from "@/lib/si/marleny-ai/client";
import { pickWikimediaImage } from "@/lib/media/wikimedia";

export const runtime = "nodejs";

function isNonEmptyString(v: unknown): v is string {
  return typeof v === "string" && v.trim().length > 0;
}

function newsQueryFor(office: string, region: string): string {
  const off = String(office || "").toLowerCase();
  const reg = String(region || "").trim();

  // Senado: alcance nacional Colombia.
  if (off.includes("senado")) return "Colombia seguridad";

  // Cámara: prioriza departamento/territorio; si no hay región, cae a Colombia.
  if (!reg) return "Colombia seguridad";
  return `${reg} Colombia seguridad`;
}

export async function POST(req: Request) {
  await requireAdmin();

  const body = await readJsonBodyWithLimit(req);
  if (!body.ok) return NextResponse.json({ error: body.error }, { status: 400 });
  if (!body.data || typeof body.data !== "object") return NextResponse.json({ error: "invalid_body" }, { status: 400 });

  const b = body.data as Record<string, unknown>;
  const candidate_id = isNonEmptyString(b.candidate_id) ? b.candidate_id.trim() : "";
  if (!candidate_id) return NextResponse.json({ error: "candidate_id_required" }, { status: 400 });

  const admin = createSupabaseAdminClient();
  if (!admin) return NextResponse.json({ error: "not_configured" }, { status: 503 });

  const { data: pol } = await admin
    .from("politicians")
    .select("id,slug,name,office,region,party,ballot_number,auto_blog_enabled,proposals")
    .eq("id", candidate_id)
    .maybeSingle();
  if (!pol) return NextResponse.json({ error: "not_found" }, { status: 404 });
  if (pol.auto_blog_enabled === false) return NextResponse.json({ error: "auto_blog_disabled" }, { status: 409 });

  const regionQuery = newsQueryFor(pol.office, pol.region);

  const article = await fetchTopGdeltArticle(regionQuery);

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
  const titleLine = ai.text.split("\n").find((l) => l.trim().length > 0) ?? `Centro informativo · ${pol.name}`;
  const imageQuery = `${(article?.title ?? titleLine).slice(0, 140)} ${pol.region} Colombia`;
  const pickedImage = await pickWikimediaImage({ query: imageQuery });
  const textWithCredits =
    pickedImage
      ? [
          ai.text.trim(),
          "",
          `Imagen (CC): ${pickedImage.image_url}`,
          `Crédito imagen: ${[pickedImage.attribution, pickedImage.author ? `Autor: ${pickedImage.author}` : null, pickedImage.license_short ? `Licencia: ${pickedImage.license_short}` : null, pickedImage.page_url ? `Fuente imagen: ${pickedImage.page_url}` : null].filter(Boolean).join(" · ")}`,
        ].join("\n")
      : ai.text;
  const { error: insErr } = await admin.from("ai_drafts").insert({
    candidate_id: pol.id,
    content_type: "blog",
    topic: article?.title ?? `Actualidad: ${regionQuery}`,
    tone: "sereno, institucional",
    generated_text: textWithCredits,
    variants: {},
    metadata: {
      source: "gdelt",
      source_url: article?.url ?? null,
      region_query: regionQuery,
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
    image_keywords: null,
    source: "web",
    status: "pending_review",
    created_at,
    updated_at: created_at,
  });

  if (insErr) return NextResponse.json({ error: "insert_failed" }, { status: 500 });
  return NextResponse.json({ ok: true });
}

