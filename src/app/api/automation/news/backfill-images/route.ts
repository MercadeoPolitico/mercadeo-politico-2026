import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { pickWikimediaImage } from "@/lib/media/wikimedia";
import { generateAndStoreNewsImage } from "@/lib/media/aiEditorialImage";

export const runtime = "nodejs";

function isBrowserOrigin(req: Request): boolean {
  // Use conservative signals that don't appear in Node/n8n fetch.
  return Boolean(
    req.headers.get("sec-fetch-site") ||
      req.headers.get("sec-ch-ua") ||
      req.headers.get("sec-ch-ua-mobile") ||
      req.headers.get("sec-ch-ua-platform"),
  );
}

function normalizeToken(v: unknown): string {
  const s = String(v ?? "").trim();
  if (!s) return "";
  if ((s.startsWith('"') && s.endsWith('"')) || (s.startsWith("'") && s.endsWith("'"))) return s.slice(1, -1).trim();
  // Fix accidental trailing literal \n in copied secrets (common).
  return s.endsWith("\\n") ? s.slice(0, -2).trim() : s;
}

function allow(req: Request): boolean {
  // Prefer MP26_AUTOMATION_TOKEN (n8n contract), fallback to legacy AUTOMATION_API_TOKEN.
  const apiToken = process.env.MP26_AUTOMATION_TOKEN ?? process.env.AUTOMATION_API_TOKEN;
  const headerToken = req.headers.get("x-automation-token") ?? "";
  if (!apiToken) return false;
  // Defensive: tolerate whitespace/newlines and accidental quotes in env/header.
  return normalizeToken(headerToken) === normalizeToken(apiToken);
}

function normalizeLineBreaks(input: string): string {
  return String(input || "")
    .replace(/\r/g, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function upsertImageMeta(args: {
  text: string;
  imageUrl: string;
  creditLine: string | null;
}): string {
  const base = normalizeLineBreaks(args.text);
  if (!base) return base;
  const lines = base.split("\n");

  // Remove old meta lines (we'll reinsert cleanly).
  const cleaned = lines.filter((l) => {
    const t = String(l || "").trim();
    const low = t.toLowerCase();
    if (low.startsWith("imagen:")) return false;
    if (low.startsWith("crédito imagen:") || low.startsWith("credito imagen:")) return false;
    if (low.startsWith("fuente imagen:")) return false;
    return true;
  });

  const insertBlock = [
    "",
    `Imagen: ${args.imageUrl}`,
    args.creditLine ? args.creditLine : null,
  ].filter(Boolean) as string[];

  const footerIdx = cleaned.findIndex((l) => String(l || "").toLowerCase().includes("contenido generado y analizado por"));
  if (footerIdx >= 0) {
    const before = cleaned.slice(0, footerIdx);
    const after = cleaned.slice(footerIdx);
    return normalizeLineBreaks([...before, ...insertBlock, ...after].join("\n"));
  }

  return normalizeLineBreaks([...cleaned, ...insertBlock].join("\n"));
}

function needsBackfill(mediaUrls: unknown): boolean {
  const arr = Array.isArray(mediaUrls) ? (mediaUrls as unknown[]) : [];
  const u = typeof arr[0] === "string" ? String(arr[0]) : "";
  if (!u.trim()) return true;
  return u.includes("/fallback/news.svg");
}

export async function POST(req: Request) {
  // Automation endpoint: server-to-server only (n8n/cron/internal services).
  if (!allow(req)) {
    if (isBrowserOrigin(req)) {
      console.warn("[automation/news/backfill-images] rejected_browser_origin", { path: "/api/automation/news/backfill-images" });
      return NextResponse.json({ error: "forbidden" }, { status: 403 });
    }
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const url = new URL(req.url);
  const dryRun = url.searchParams.get("dry_run") === "true";
  const limit = Math.max(1, Math.min(50, Number(url.searchParams.get("limit") ?? "20") || 20));

  const admin = createSupabaseAdminClient();
  if (!admin) return NextResponse.json({ error: "supabase_not_configured" }, { status: 503 });

  // Fetch a recent slice and backfill only those that still have placeholder media.
  const { data: rows, error } = await admin
    .from("citizen_news_posts")
    .select("id,candidate_id,title,excerpt,body,media_urls,published_at")
    .eq("status", "published")
    .order("published_at", { ascending: false })
    .limit(200);

  if (error) return NextResponse.json({ error: "db_error" }, { status: 500 });

  const candidates = (rows ?? []).filter((r) => needsBackfill((r as any)?.media_urls)).slice(0, limit) as any[];
  if (candidates.length === 0) return NextResponse.json({ ok: true, updated: 0, skipped: 0, dry_run: dryRun });

  const candidateIds = Array.from(new Set(candidates.map((r) => String(r.candidate_id)).filter(Boolean)));
  const { data: pols } = await admin.from("politicians").select("id,region").in("id", candidateIds);
  const regionById = new Map<string, string>();
  for (const p of pols ?? []) regionById.set(String((p as any).id), String((p as any).region || "").trim());

  const updatedIds: string[] = [];
  let skipped = 0;

  for (const row of candidates) {
    const id = String(row.id);
    const candidate_id = String(row.candidate_id);
    const region = regionById.get(candidate_id) || "Colombia";
    const title = String(row.title || "").trim().slice(0, 180);

    const queryPrimary = [region, "Colombia", title].filter(Boolean).join(" ");
    const queryGeo = [region, "Colombia", "paisaje", "fotografía", "foto"].filter(Boolean).join(" ");

    const picked =
      (await pickWikimediaImage({ query: queryPrimary, avoid_urls: [] })) ?? (await pickWikimediaImage({ query: queryGeo, avoid_urls: [] }));

    const imageUrl = picked?.thumb_url ?? picked?.image_url ?? null;
    const creditLine = (() => {
      if (picked?.image_url) {
        const creditBits = [
          typeof picked.attribution === "string" ? picked.attribution : null,
          typeof picked.author === "string" && picked.author.trim() ? `Autor: ${picked.author.trim()}` : null,
          typeof picked.license_short === "string" && picked.license_short.trim() ? `Licencia: ${picked.license_short.trim()}` : null,
          picked.page_url ? `Fuente imagen: ${picked.page_url}` : null,
        ].filter(Boolean);
        return creditBits.length ? `Crédito imagen: ${creditBits.join(" · ")}` : null;
      }
      return null;
    })();

    const finalUrl = imageUrl
      ? imageUrl
      : await (async () => {
          const aiPrompt = [
            "Imagen editorial realista para una nota cívica en Colombia (no propaganda).",
            "Requisitos: sin texto, sin logos, sin marcas de agua, sin banderas explícitas, sin símbolos partidistas.",
            "Sin rostros identificables. Sin violencia explícita.",
            `Contexto regional: ${region}.`,
            title ? `Tema/titular (contexto): ${title}` : "",
            "Estilo: fotoperiodístico moderno, creíble, sobrio y atractivo.",
          ]
            .filter(Boolean)
            .join("\n");

          const stored = await generateAndStoreNewsImage({
            admin,
            candidateId: candidate_id,
            seed: `backfill-${id}`,
            prompt: aiPrompt,
            maxMs: 18_000,
          });
          return stored.ok ? stored.public_url : null;
        })();

    if (!finalUrl) {
      skipped++;
      continue;
    }

    const nextBody = upsertImageMeta({ text: String(row.body || ""), imageUrl: finalUrl, creditLine });
    const nextExcerpt = (() => {
      const ex = String(row.excerpt || "");
      if (!ex.toLowerCase().includes("imagen:")) return ex;
      return upsertImageMeta({ text: ex, imageUrl: finalUrl, creditLine });
    })();

    if (!dryRun) {
      const { error: upErr } = await admin
        .from("citizen_news_posts")
        .update({
          media_urls: [finalUrl],
          body: nextBody,
          excerpt: nextExcerpt,
        })
        .eq("id", id);
      if (upErr) {
        skipped++;
        continue;
      }
    }

    updatedIds.push(id);
  }

  return NextResponse.json({
    ok: true,
    dry_run: dryRun,
    updated: updatedIds.length,
    skipped,
    updated_ids: updatedIds,
  });
}

