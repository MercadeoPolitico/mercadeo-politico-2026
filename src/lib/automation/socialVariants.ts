export type NetworkKey = "facebook" | "instagram" | "threads" | "x" | "telegram" | "reddit";

export type VariantsByNetwork = Record<NetworkKey, string> & {
  // Optional extras used internally (not required by n8n canonical routing).
  blog?: string;
};

function safeLine(text: string): string {
  return String(text || "")
    .replace(/\r/g, "")
    .split("\n")
    .map((l) => l.trim())
    .find((l) => l.length > 0) ?? "";
}

function clamp(text: string, max: number): string {
  const s = String(text || "").trim();
  if (!s) return "";
  return s.length <= max ? s : s.slice(0, max - 1).trimEnd();
}

function cleanKeywords(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  return v
    .filter((x) => typeof x === "string")
    .map((s) => s.trim())
    .filter(Boolean)
    .slice(0, 16);
}

function toHashtags(keywords: string[], maxCount: number): string {
  const tags = keywords
    .filter(Boolean)
    .slice(0, maxCount)
    .map((k) => `#${k.replaceAll(/[^a-z0-9áéíóúñ]+/gi, "").slice(0, 28)}`)
    .filter((t) => t.length > 1);
  return tags.join(" ");
}

function shortSummaryFromBlog(blog: string, maxChars: number): string {
  const raw = String(blog || "").replace(/\r/g, "").trim();
  if (!raw) return "";
  // Drop the first line (title) and take the first paragraphs.
  const lines = raw.split("\n").map((l) => l.trim());
  const rest = lines.slice(1).join("\n").trim();
  const paras = rest.split(/\n{2,}/g).map((p) => p.trim()).filter(Boolean);
  const pick = paras.slice(0, 2).join("\n\n").trim();
  return clamp(pick || rest, maxChars);
}

export function ensureSocialVariants(args: {
  baseText: string;
  // Optional richer blog source.
  blogText?: string | null;
  // Optional precomputed variants (may be partial).
  variants?: Partial<Record<NetworkKey | "blog", string>> | null;
  seo_keywords?: unknown;
  candidate?: { name?: string | null; ballot_number?: string | number | null } | null;
}): VariantsByNetwork {
  const baseText = String(args.baseText || "").trim();
  const blog = String(args.blogText ?? "").trim();
  const title = safeLine(blog || baseText) || "Centro informativo ciudadano";
  const summary = shortSummaryFromBlog(blog || baseText, 900);
  const kws = cleanKeywords(args.seo_keywords);
  const hashtags = toHashtags(kws, 6);
  const candidateName = String(args.candidate?.name ?? "").trim();
  const ballot = args.candidate?.ballot_number ? String(args.candidate?.ballot_number) : "";

  const v = (args.variants ?? {}) as Partial<Record<NetworkKey | "blog", string>>;

  // FACEBOOK: noticiero + contexto (longitud media)
  const fbFallback = [
    title,
    "",
    clamp(summary, 820),
    "",
    "Lee más en /centro-informativo",
    hashtags ? `\n${hashtags}` : "",
  ]
    .filter(Boolean)
    .join("\n")
    .trim();

  // INSTAGRAM: breve + emocional (acompaña media)
  const igFallback = [
    title,
    "",
    candidateName ? `Con ${candidateName}${ballot ? ` (Tarjetón ${ballot})` : ""}, trabajamos por seguridad proactiva y ciudadanía.` : "Seguridad proactiva y ciudadanía: lo que está en juego.",
    "",
    clamp(summary.replaceAll("\n", " ").slice(0, 260), 300),
    "",
    hashtags ? `${hashtags}` : "",
  ]
    .filter(Boolean)
    .join("\n")
    .trim();

  // THREADS: conversacional, opinión cívica cercana
  const threadsFallback = [
    `${title}`,
    "",
    clamp(summary, 520),
    "",
    "¿Qué cambiarías tú para que esto no se repita? Te leo.",
  ]
    .filter(Boolean)
    .join("\n")
    .trim();

  // X: corto, directo, headline + idea central
  const xFallback = clamp(
    [
      title,
      "",
      clamp(summary.replaceAll("\n", " ").slice(0, 210), 220),
      "",
      "/centro-informativo",
    ]
      .filter(Boolean)
      .join("\n")
      .trim(),
    280,
  );

  // TELEGRAM: más largo, tipo comunicado/boletín
  const tgFallback = [
    `COMUNICADO · ${title}`,
    "",
    clamp(summary, 1400),
    "",
    "Consulta el análisis completo en /centro-informativo",
    hashtags ? `\n${hashtags}` : "",
  ]
    .filter(Boolean)
    .join("\n")
    .trim();

  // REDDIT: explicativo, menos promocional, más contextual
  const rdFallback = [
    title,
    "",
    clamp(summary, 1200),
    "",
    "Contexto: /centro-informativo",
    "",
    "Pregunta abierta: ¿cómo debería responder el Estado y la ciudadanía ante este tipo de situaciones?",
  ]
    .filter(Boolean)
    .join("\n")
    .trim();

  const out: VariantsByNetwork = {
    facebook: clamp(v.facebook || fbFallback, 1100),
    instagram: clamp(v.instagram || igFallback, 1100),
    threads: clamp(v.threads || threadsFallback, 1100),
    x: clamp(v.x || xFallback, 280),
    telegram: clamp(v.telegram || tgFallback, 3800),
    reddit: clamp(v.reddit || rdFallback, 3800),
  };

  if (v.blog || blog) out.blog = clamp(String(v.blog || blog), 12000);
  return out;
}

