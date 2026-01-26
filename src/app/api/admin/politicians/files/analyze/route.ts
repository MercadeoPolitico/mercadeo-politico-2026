import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth/admin";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { readJsonBodyWithLimit } from "@/lib/automation/readBody";
import { openAiJson } from "@/lib/automation/openai";

export const runtime = "nodejs";

function isNonEmptyString(v: unknown): v is string {
  return typeof v === "string" && v.trim().length > 0;
}

function clampText(s: string, max: number): string {
  const t = String(s || "").trim();
  if (!t) return "";
  return t.length <= max ? t : t.slice(0, max).trimEnd();
}

async function fetchBytes(url: string, maxBytes: number): Promise<Uint8Array> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 12_000);
  try {
    const resp = await fetch(url, { method: "GET", redirect: "follow", cache: "no-store", signal: ctrl.signal });
    if (!resp.ok) throw new Error(`http_${resp.status}`);
    const len = Number(resp.headers.get("content-length") ?? "0");
    if (Number.isFinite(len) && len > maxBytes) throw new Error("too_large");
    const ab = await resp.arrayBuffer();
    if (ab.byteLength > maxBytes) throw new Error("too_large");
    return new Uint8Array(ab);
  } finally {
    clearTimeout(t);
  }
}

async function extractTextFromFile(args: { url: string; filename: string }): Promise<{ ok: true; text: string } | { ok: false; reason: string }> {
  const url = String(args.url || "").trim();
  if (!/^https?:\/\//i.test(url)) return { ok: false, reason: "invalid_url" };

  const filename = String(args.filename || "").trim().toLowerCase();
  const ext = filename.split(".").pop() ?? "";

  // Hard cap: 8MB download.
  const bytes = await fetchBytes(url, 8_000_000).catch((e: any) => ({ error: e?.message || "download_failed" } as any));
  if ((bytes as any)?.error) return { ok: false, reason: String((bytes as any).error) };

  // Text-like
  if (["txt", "md", "markdown", "csv", "json"].includes(ext)) {
    const text = new TextDecoder("utf-8", { fatal: false }).decode(bytes as Uint8Array);
    return { ok: true, text };
  }

  // PDF
  if (ext === "pdf" || url.toLowerCase().includes(".pdf")) {
    try {
      const pdfParse = (await import("pdf-parse")).default as any;
      const out = await pdfParse(Buffer.from(bytes as Uint8Array));
      const text = typeof out?.text === "string" ? out.text : "";
      if (!text.trim()) return { ok: false, reason: "pdf_empty" };
      return { ok: true, text };
    } catch {
      return { ok: false, reason: "pdf_parse_failed" };
    }
  }

  return { ok: false, reason: "unsupported_file_type" };
}

type BlogDraftJson = {
  title: string;
  body: string;
  seo_keywords?: string[];
  image_keywords?: string[];
};

export async function POST(req: Request) {
  await requireAdmin();
  const admin = createSupabaseAdminClient();
  if (!admin) return NextResponse.json({ error: "not_configured" }, { status: 503 });

  const body = await readJsonBodyWithLimit(req);
  if (!body.ok) return NextResponse.json({ error: body.error }, { status: 400 });
  if (!body.data || typeof body.data !== "object") return NextResponse.json({ error: "invalid_body" }, { status: 400 });
  const b = body.data as Record<string, unknown>;

  const politician_id = isNonEmptyString(b.politician_id) ? b.politician_id.trim() : "";
  const file_url = isNonEmptyString(b.file_url) ? b.file_url.trim() : "";
  const filename = isNonEmptyString(b.filename) ? b.filename.trim() : "documento.pdf";
  if (!politician_id) return NextResponse.json({ error: "politician_id_required" }, { status: 400 });
  if (!file_url) return NextResponse.json({ error: "file_url_required" }, { status: 400 });

  const { data: pol } = await admin.from("politicians").select("id,name,office,region,party,ballot_number,proposals").eq("id", politician_id).maybeSingle();
  if (!pol) return NextResponse.json({ error: "not_found" }, { status: 404 });

  const extracted = await extractTextFromFile({ url: file_url, filename });
  if (!extracted.ok) return NextResponse.json({ error: extracted.reason }, { status: 415 });

  const sourceBlock = `Fuente (documento subido): ${file_url}`;
  const docText = clampText(extracted.text, 16_000);

  const prompt = [
    "Convierte el siguiente documento en un borrador de blog cívico para Colombia.",
    "Reglas: NO inventes hechos, NO atribuyas citas exactas si no aparecen en el texto, NO incluyas propaganda.",
    "Escribe en español, tono informativo y sobrio.",
    "Estructura: 1) Título (primera línea, sin nombre del candidato), 2) 3–6 párrafos, 3) sección de 'Cómo encaja' con 2 bullets conectando al programa del candidato SIN manipulación.",
    "",
    `Contexto candidato: ${pol.name} · ${pol.office} · ${pol.region}${pol.party ? ` · ${pol.party}` : ""}${pol.ballot_number ? ` · Tarjetón ${pol.ballot_number}` : ""}`,
    pol.proposals ? `Programa (resumen):\n${clampText(String(pol.proposals), 1800)}` : "",
    "",
    sourceBlock,
    "",
    "Contenido del documento (extracto):",
    docText,
  ]
    .filter(Boolean)
    .join("\n");

  const oa = await openAiJson<BlogDraftJson>({
    task: "politician_file_analyze_to_blog",
    system:
      "Eres un editor cívico. Responde SOLO JSON con el esquema {title:string, body:string, seo_keywords?:string[], image_keywords?:string[]}." +
      " El body NO debe incluir texto de campaña ni llamados a voto. Debe incluir al final una línea 'Fuente:' con la URL del documento.",
    user: prompt,
  });

  if (!oa.ok) return NextResponse.json({ error: "openai_failed" }, { status: 502 });
  const data = oa.data as any;
  const title = typeof data?.title === "string" ? data.title.trim().slice(0, 160) : "";
  const bodyText = typeof data?.body === "string" ? data.body.trim() : "";
  if (!title || !bodyText) return NextResponse.json({ error: "bad_ai_output" }, { status: 502 });

  const generated_text = [title, "", bodyText, "", `Fuente: ${file_url}`].join("\n").trim();
  const now = new Date().toISOString();
  const seo_keywords = Array.isArray(data?.seo_keywords) ? data.seo_keywords.filter((x: any) => typeof x === "string").slice(0, 16) : [];
  const image_keywords = Array.isArray(data?.image_keywords) ? data.image_keywords.filter((x: any) => typeof x === "string").slice(0, 16) : seo_keywords;

  const { data: inserted, error: insErr } = await admin
    .from("ai_drafts")
    .insert({
      candidate_id: politician_id,
      content_type: "blog",
      topic: `Documento: ${filename}`,
      tone: "informativo",
      generated_text,
      variants: {},
      metadata: {
        source_name: "Documento subido (campaña)",
        source_url: file_url,
        seo_keywords,
        image_keywords,
        file: { url: file_url, filename },
      },
      image_keywords,
      source: "web",
      status: "pending_review",
      created_at: now,
      updated_at: now,
    } as any)
    .select("id")
    .maybeSingle();

  if (insErr) return NextResponse.json({ error: "insert_failed" }, { status: 500 });
  return NextResponse.json({ ok: true, draft_id: inserted?.id ?? null });
}

