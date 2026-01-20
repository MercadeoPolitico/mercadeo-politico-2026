import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth/admin";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { readJsonBodyWithLimit } from "@/lib/automation/readBody";
import { fetchTopGdeltArticle } from "@/lib/news/gdelt";
import { callMarlenyAI } from "@/lib/si/marleny-ai/client";

export const runtime = "nodejs";

function isNonEmptyString(v: unknown): v is string {
  return typeof v === "string" && v.trim().length > 0;
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
    .select("id,slug,name,office,region,party,ballot_number")
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
  const { error: insErr } = await admin.from("ai_drafts").insert({
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

  if (insErr) return NextResponse.json({ error: "insert_failed" }, { status: 400 });
  return NextResponse.json({ ok: true });
}

