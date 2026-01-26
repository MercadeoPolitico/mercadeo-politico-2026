import { NextResponse } from "next/server";
import { readJsonBodyWithLimit } from "@/lib/automation/readBody";
import { isAdminSession } from "@/lib/auth/adminSession";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { fetchTopGdeltArticle } from "@/lib/news/gdelt";
import { callMarlenyAI } from "@/lib/si/marleny-ai/client";
import { openAiJson } from "@/lib/automation/openai";
import { regionalProvidersForCandidate } from "@/lib/news/providers";
import { submitToN8n } from "@/lib/automation/n8n";
import { getSiteUrlString } from "@/lib/site";
import { pickWikimediaImage } from "@/lib/media/wikimedia";
import { generateAndStoreNewsImage } from "@/lib/media/aiEditorialImage";
import { fetchOpenGraphMedia } from "@/lib/media/opengraph";
import { pickTopRssItem, type RssPickMode, type RssSource, type RssItem } from "@/lib/news/rss";
import { ensureSocialVariants } from "@/lib/automation/socialVariants";
import { createHash, randomUUID } from "node:crypto";

export const runtime = "nodejs";

function isBrowserOrigin(req: Request): boolean {
  return Boolean(
    req.headers.get("sec-fetch-site") ||
      req.headers.get("sec-ch-ua") ||
      req.headers.get("sec-ch-ua-mobile") ||
      req.headers.get("sec-ch-ua-platform"),
  );
}

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

function normalizeToken(v: unknown): string {
  const s = String(v ?? "").trim();
  if (!s) return "";
  if ((s.startsWith('"') && s.endsWith('"')) || (s.startsWith("'") && s.endsWith("'"))) return s.slice(1, -1).trim();
  // Fix accidental trailing literal \n in copied secrets (common).
  return s.endsWith("\\n") ? s.slice(0, -2).trim() : s;
}

function allowAutomation(req: Request): boolean {
  // Prefer MP26_AUTOMATION_TOKEN (n8n contract), fallback to legacy AUTOMATION_API_TOKEN.
  const apiToken = process.env.MP26_AUTOMATION_TOKEN ?? process.env.AUTOMATION_API_TOKEN;
  const headerToken = req.headers.get("x-automation-token") ?? "";
  if (!apiToken) return false;
  // Defensive: tolerate whitespace/newlines and accidental quotes in env/header.
  return normalizeToken(headerToken) === normalizeToken(apiToken);
}

function newsQueryFor(office: string, region: string): string {
  const off = office.toLowerCase();
  if (off.includes("senado")) {
    // National scope: prioritize high-impact / civic risk topics.
    return "Colombia (secuestro OR extorsión OR homicidio OR atentado OR narcotráfico OR corrupción OR accidente OR muerte OR robo OR atraco OR violencia) seguridad";
  }
  // Cámara: prioritize territory (Meta, etc). Allow national if it impacts the region (GDELT ranking helps).
  const reg = String(region ?? "").trim();
  return reg
    ? `${reg} Colombia (secuestro OR extorsión OR homicidio OR atentado OR narcotráfico OR corrupción OR accidente OR violencia) seguridad`
    : "Colombia (secuestro OR extorsión OR homicidio OR atentado OR narcotráfico OR corrupción OR accidente OR violencia) seguridad";
}

function severityScoreFromTitle(title: string): number {
  const t = String(title || "").toLowerCase();
  const severe = [
    "secuestro",
    "extors",
    "homicid",
    "asesin",
    "sicari",
    "masacre",
    "atent",
    "bomba",
    "explos",
    "narcot",
    "captur",
    "incaut",
    "corrup",
    "fraude",
    "rob",
    "atraco",
    "accidente",
    "choque",
    "incendio",
    "muert",
    "herid",
    "desaparec",
    "amenaza",
    // Emergencias / necesidades públicas (alto impacto cívico)
    "emergenc",
    "inund",
    "desliz",
    "derrumbe",
    "sismo",
    "tembl",
    "sequía",
    "sequia",
    "racion",
    "sin agua",
    "corte de agua",
    "apagón",
    "apagón",
    "hospital",
    "urgenc",
    "salud",
    "vacun",
    "desplaz",
  ];
  const viral = ["viral", "tendencia", "concierto", "música", "musica", "fútbol", "futbol", "festival", "show", "entreten"];
  const severeHits = severe.filter((k) => t.includes(k)).length;
  const viralHits = viral.filter((k) => t.includes(k)).length;
  // Push severe to the top; still allow fallback selection when none exist.
  return severeHits * 3 - viralHits;
}

function isViralTitle(title: string): boolean {
  const t = String(title || "").toLowerCase();
  return ["viral", "tendencia", "concierto", "música", "musica", "fútbol", "futbol", "festival", "show", "entreten"].some((k) => t.includes(k));
}

function isBlockedNewsUrl(url: string): boolean {
  try {
    const h = new URL(url).host.toLowerCase();
    const blocked = ["thehindu.com", "carbuzz.com"];
    return blocked.some((b) => h === b || h.endsWith(`.${b}`));
  } catch {
    return false;
  }
}

async function fetchBestNewsArticle(args: {
  office: string;
  region: string;
  regional_hints: string[];
  avoid_urls?: string[];
}): Promise<import("@/lib/news/gdelt").GdeltArticle | null> {
  const off = args.office.toLowerCase();
  const reg = String(args.region || "").trim();
  const queries =
    off.includes("senado")
      ? [
          "Colombia seguridad",
          "Colombia corrupción",
          "Colombia narcotráfico",
          "Colombia secuestro",
          "Colombia extorsión",
          // fallback: still Colombia, broader
          "Colombia",
        ]
      : reg
        ? [
            `${reg} Colombia seguridad`,
            `${reg} Colombia extorsión`,
            `${reg} Colombia secuestro`,
            `${reg} Colombia corrupción`,
            `Villavicencio seguridad`,
            // fallback to national if local isn't available but could impact region
            "Colombia seguridad",
            "Colombia corrupción",
            "Colombia",
          ]
        : ["Colombia seguridad", "Colombia corrupción", "Colombia"];

  for (const q of queries) {
    // eslint-disable-next-line no-await-in-loop
    const a = await fetchTopGdeltArticle(q, {
      preferred_url_hints: args.regional_hints,
      prefer_sensational: false,
      exclude_urls: args.avoid_urls ?? [],
    });
    if (!a) continue;
    if (isBlockedNewsUrl(a.url)) continue;
    // Enforce "grave > viral": for early queries, require a minimum severity.
    const sev = severityScoreFromTitle(a.title);
    const isEarly = q.toLowerCase().includes("seguridad") || q.toLowerCase().includes("extors") || q.toLowerCase().includes("secuestro") || q.toLowerCase().includes("corrup");
    if (isEarly && sev < 3) continue;
    return a;
  }
  return null;
}

async function fetchViralNewsArticle(args: {
  office: string;
  region: string;
  regional_hints: string[];
  avoid_urls?: string[];
}): Promise<import("@/lib/news/gdelt").GdeltArticle | null> {
  const off = args.office.toLowerCase();
  const reg = String(args.region || "").trim();
  const queries =
    off.includes("senado")
      ? [
          "Colombia tendencia",
          "Colombia viral",
          "Colombia redes sociales",
          "Colombia entretenimiento",
          "Colombia fútbol",
          "Colombia música",
          // fallback: still Colombia, broader
          "Colombia",
        ]
      : reg
        ? [
            `${reg} tendencia`,
            `${reg} viral`,
            "Villavicencio tendencia",
            "Meta tendencia",
            // fallback to national if local isn't available
            "Colombia tendencia",
            "Colombia viral",
            "Colombia",
          ]
        : ["Colombia tendencia", "Colombia viral", "Colombia"];

  for (const q of queries) {
    // eslint-disable-next-line no-await-in-loop
    const a = await fetchTopGdeltArticle(q, {
      preferred_url_hints: args.regional_hints,
      prefer_sensational: false,
      exclude_urls: args.avoid_urls ?? [],
    });
    if (!a) continue;
    if (isBlockedNewsUrl(a.url)) continue;
    // Prefer actual viral-ish headlines.
    if (!isViralTitle(a.title)) continue;
    return a;
  }
  return null;
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
  | {
      ok: false;
      engine: EngineName;
      ms: number;
      error: "timeout" | "disabled" | "not_configured" | "bad_response" | "upstream_error" | "failed";
      // Safe, optional diagnostics (no secrets): providers attempted, http status, host.
      meta?: unknown;
    };

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

function tryExtractJsonObject(text: string): unknown | null {
  const raw = String(text || "").trim();
  if (!raw) return null;
  const direct = safeJsonParse(raw);
  if (direct) return direct;

  // Strip markdown fences if present.
  const unfenced = raw.replaceAll(/^```[a-z]*\s*/gim, "").replaceAll(/```$/gim, "").trim();
  const unfencedParsed = safeJsonParse(unfenced);
  if (unfencedParsed) return unfencedParsed;

  // Best-effort: parse the largest {...} block.
  const first = unfenced.indexOf("{");
  const last = unfenced.lastIndexOf("}");
  if (first >= 0 && last > first) {
    const slice = unfenced.slice(first, last + 1);
    const sliced = safeJsonParse(slice);
    if (sliced) return sliced;
  }
  return null;
}

function extractEngineOutput(parsed: unknown): EngineOutput | null {
  if (!parsed || typeof parsed !== "object") return null;
  const p = parsed as Record<string, unknown>;
  const sentiment = isSentiment(p.sentiment) ? (p.sentiment as Sentiment) : ("neutral" as Sentiment);
  const seo_keywords = cleanKeywords(p.seo_keywords);
  const master_editorial = typeof p.master_editorial === "string" ? p.master_editorial.trim() : "";
  const pv = p.platform_variants;
  const platform_variants =
    pv && typeof pv === "object"
      ? {
          blog: typeof (pv as any).blog === "string" ? String((pv as any).blog).trim() : "",
          facebook: typeof (pv as any).facebook === "string" ? String((pv as any).facebook).trim() : "",
          x:
            typeof (pv as any).x === "string"
              ? String((pv as any).x).trim()
              : typeof (pv as any).twitter === "string"
                ? String((pv as any).twitter).trim()
                : "",
          reddit: typeof (pv as any).reddit === "string" ? String((pv as any).reddit).trim() : "",
        }
      : { blog: "", facebook: "", x: "", reddit: "" };

  const image_keywords = cleanKeywords(p.image_keywords);

  if (!platform_variants.blog) return null;
  // We strongly prefer SEO keywords, but don't hard-fail engines that return short arrays.
  // We'll backfill minimal keywords downstream if needed.

  return {
    sentiment,
    seo_keywords,
    master_editorial,
    platform_variants,
    image_keywords: image_keywords.length ? image_keywords : undefined,
  };
}

function synthesizeVariants(args: {
  blog: string;
  candidate: { name: string; ballot_number: string | number | null };
  seo_keywords: string[];
}): Pick<EngineOutput, "platform_variants" | "seo_keywords" | "master_editorial"> {
  const blog = String(args.blog || "").trim();
  const title = blog.split("\n").find((l) => l.trim())?.trim() ?? "Centro informativo ciudadano";
  const ballot = args.candidate.ballot_number ? String(args.candidate.ballot_number) : "";
  const name = args.candidate.name || "";

  const seo = (args.seo_keywords ?? []).map((s) => String(s || "").trim()).filter(Boolean);
  const seoBackfill = seo.length
    ? seo.slice(0, 12)
    : [name, ballot ? `Tarjetón ${ballot}` : null, "Colombia", "seguridad", "ciudadanía"].filter(Boolean).map(String);

  const hashTags = seoBackfill
    .slice(0, 5)
    .map((k) => `#${k.replaceAll(/[^a-z0-9áéíóúñ]+/gi, "").slice(0, 28)}`)
    .filter((x) => x.length > 1)
    .slice(0, 3)
    .join(" ");

  const fb = `${title}\n\n${blog.slice(0, 820).trim()}\n\nLee más en /centro-informativo\n\n${hashTags}`.slice(0, 900);
  const x = `${title}\n\n${blog.slice(0, 210).trim()}\n\n/centro-informativo\n\n${hashTags}`.slice(0, 280);
  const reddit = `${title}\n\nResumen cívico:\n${blog.split(/\n{2,}/g).slice(0, 3).join("\n\n").slice(0, 900)}\n\nFuente/Contexto: /centro-informativo`;

  const master = blog.split(/\n{2,}/g).slice(0, 3).join("\n\n").slice(0, 900);

  return {
    seo_keywords: seoBackfill,
    master_editorial: master,
    platform_variants: { blog, facebook: fb, x, reddit },
  };
}

function ensureCandidateMention(blog: string, candidate: { name: string; ballot_number: string | number | null }): string {
  const base = String(blog || "").trim();
  if (!base) return base;
  const lower = base.toLowerCase();
  const name = String(candidate.name || "").trim();
  const bn = candidate.ballot_number ? String(candidate.ballot_number) : "";
  const hasName = name.length >= 4 ? lower.includes(name.toLowerCase()) : true;
  const hasBallot = bn ? lower.includes(bn) || lower.includes(`tarjetón ${bn}`.toLowerCase()) : true;
  if (hasName && hasBallot) return base;

  const title = base.split("\n").find((l) => l.trim())?.trim() ?? "Centro informativo ciudadano";
  const rest = base.split("\n").slice(1).join("\n").trim();
  const injected = [
    title,
    "",
    `Enfoque cívico: análisis para ${name}${bn ? ` (Tarjetón ${bn})` : ""}.`,
    "",
    rest,
  ]
    .filter(Boolean)
    .join("\n");
  return injected;
}

function baselineValidText(out: EngineOutput, candidateName: string): boolean {
  const t = `${out.master_editorial}\n${out.platform_variants.blog}`.toLowerCase();
  // quick safety: reject obvious violent incitement / extremist calls
  const banned = [/maten\s+a\s+/i, /extermin/i, /limpieza\s+social/i, /golpe\s+de\s+estado/i, /incendiar/i];
  if (banned.some((r) => r.test(t))) return false;
  return true;
}

function isLikelySpanish(text: string): boolean {
  const t = String(text || "").toLowerCase();
  if (!t.trim()) return false;
  const esHits = [" el ", " la ", " de ", " que ", " y ", " en ", " por ", " para ", " con ", " colombia", " meta", " bogotá"].filter((w) =>
    t.includes(w),
  ).length;
  const enHits = [" the ", " and ", " to ", " of ", " in ", " over ", " after ", " with ", " for "].filter((w) => t.includes(w)).length;
  const hasAccents = /[áéíóúñ]/i.test(t);
  if (enHits >= 3 && esHits <= 1 && !hasAccents) return false;
  return esHits >= 2 || hasAccents;
}

async function rewriteToSpanishColombia(args: {
  pol: { id: string; name: string; office: string; party: string | null; region: string; ballot_number: string | null };
  out: EngineOutput;
}): Promise<EngineOutput | null> {
  const topic = [
    "Reescribe el siguiente JSON para que TODO el texto quede en español (Colombia).",
    "Reglas:",
    "- Mantén el MISMO esquema JSON y los mismos campos.",
    "- Traduce si hay inglés. No inventes datos nuevos.",
    "- Mantén el enfoque cívico, sobrio y verificable.",
    "- Conserva /centro-informativo como enlace relativo donde aplique.",
    "",
    "JSON (entrada):",
    JSON.stringify(args.out),
  ].join("\n");

  const wrapped = await withTimeout(
    callMarlenyAI({
      candidateId: args.pol.id,
      contentType: "blog",
      topic,
      tone: "editorial sobrio, institucional, humano",
    }),
    25000,
  );
  if (!wrapped.ok) return null;
  const r = wrapped.value;
  if (!r?.ok) return null;
  const parsed = safeJsonParse(String(r.text ?? ""));
  const data = extractEngineOutput(parsed);
  if (!data) return null;
  if (!baselineValidText(data, args.pol.name)) return null;
  const combined = `${data.master_editorial}\n${data.platform_variants.blog}\n${data.platform_variants.facebook}\n${data.platform_variants.x}\n${data.platform_variants.reddit}`;
  if (!isLikelySpanish(combined)) return null;
  return data;
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

function slugify(input: string): string {
  const base = input
    .toLowerCase()
    .normalize("NFKD")
    .replaceAll(/[\u0300-\u036f]/g, "")
    .replaceAll(/[^a-z0-9]+/g, "-")
    .replaceAll(/^-+|-+$/g, "");
  return base.length ? base.slice(0, 64) : `post-${Date.now()}`;
}

function wordCount(text: string): number {
  return String(text || "")
    .trim()
    .split(/\s+/g)
    .filter(Boolean).length;
}

function extractSeoFromText(text: string): string[] {
  const t = String(text || "");
  const lines = t.split("\n").map((l) => l.trim());
  const seoLine = lines.find((l) => /^seo\s*:/i.test(l)) ?? "";
  if (seoLine) {
    const rest = seoLine.replace(/^seo\s*:\s*/i, "").trim();
    const parts = rest
      .split(/[,\u2022]/g)
      .map((s) => s.trim())
      .filter(Boolean);
    if (parts.length) return parts.slice(0, 12);
  }
  return [];
}

function stripSeoLine(text: string): string {
  const lines = String(text || "").split("\n");
  return lines.filter((l) => !/^seo\s*:/i.test(l.trim())).join("\n").trim();
}

function normalizeLineBreaks(input: string): string {
  return String(input || "")
    .replace(/\r/g, "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function ensureSeoLine(blog: string, seo: string[]): string {
  const base = String(blog || "").trim();
  if (!base) return base;
  if (/^seo\s*:/im.test(base)) return base;
  const top = (seo ?? []).map((s) => String(s || "").trim()).filter(Boolean).slice(0, 5);
  if (!top.length) return base;
  return `${base}\n\nSEO: ${top.join(", ")}`;
}

function normalizeSpaces(s: string): string {
  return String(s || "")
    .replace(/\s+/g, " ")
    .replace(/\s+([,.;:!?])/g, "$1")
    .trim();
}

function deriveEditorialAxisFromProposals(proposalsRaw: string): string | null {
  const raw = String(proposalsRaw || "").trim();
  if (!raw) return null;
  const lines = raw
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);
  // Prefer a short heading (## / ###) that looks like an axis.
  for (const l of lines) {
    const t = l.replace(/^#+\s*/, "").trim();
    if (t.length >= 10 && t.length <= 72) return t;
  }
  // Fallback: first bullet
  const bullet = lines.find((l) => l.startsWith("- ") || l.startsWith("* "));
  if (bullet) {
    const t = bullet.replace(/^[-*]\s+/, "").trim();
    if (t.length >= 10) return t.slice(0, 72);
  }
  // Fallback: first sentence-ish chunk
  const first = lines[0] ?? "";
  return first.length >= 10 ? first.slice(0, 72) : null;
}

function sanitizeHeadline(args: { titleLine: string; candidateName: string; ballotNumber?: string | number | null; region?: string | null }): string {
  const name = String(args.candidateName || "").trim();
  const bn = args.ballotNumber ? String(args.ballotNumber) : "";
  let t = String(args.titleLine || "").trim();
  if (!t) return "";
  // Remove obvious candidate mentions (case-insensitive).
  if (name.length >= 3) {
    const escaped = name.replaceAll(/[.*+?^${}()|[\]\\]/g, "\\$&");
    t = t.replaceAll(new RegExp(escaped, "ig"), "").trim();
  }
  if (bn) {
    t = t.replaceAll(new RegExp(`\\b${bn.replaceAll(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "g"), "").trim();
    t = t.replaceAll(/tarjet[oó]n\s*\d+/gi, "").trim();
  }
  // Remove leftover punctuation/extra separators.
  t = t.replaceAll(/[·|•]+/g, " ").trim();
  t = normalizeSpaces(t);
  // Guardrails: ensure it's still a meaningful title.
  if (t.length < 12) {
    const reg = String(args.region || "").trim();
    return reg ? `Actualidad ciudadana · ${reg}` : "Actualidad ciudadana · Colombia";
  }
  return t.slice(0, 120);
}

function buildSubtitle(args: { candidateName: string; office: string; axis: string | null; ballotNumber?: string | number | null }): string {
  const name = normalizeSpaces(args.candidateName).slice(0, 80);
  const office = normalizeSpaces(args.office).slice(0, 40);
  const axis = args.axis ? normalizeSpaces(args.axis).slice(0, 64) : "Agenda cívica y seguridad ciudadana";
  const bn = args.ballotNumber ? `Tarjetón ${String(args.ballotNumber).trim()}` : null;
  // Order: Name · Office · Tarjetón N · Axis
  return `${name} · ${office} · ${bn ? `${bn} · ` : ""}${axis}…`.slice(0, 140);
}

function stripMarkdownLike(input: string): string {
  return String(input || "")
    .replaceAll(/[*_`>#-]/g, " ")
    .replaceAll(/\s+/g, " ")
    .trim();
}

function pickVariantIndex(seed: string, mod: number): number {
  const s = String(seed || "mp26").slice(0, 300);
  const hex = createHash("sha256").update(s).digest("hex").slice(0, 8);
  const n = parseInt(hex, 16) >>> 0;
  return mod > 0 ? n % mod : 0;
}

function paraphraseAxis(axis: string, seed: string): string {
  const a = stripMarkdownLike(axis).toLowerCase();
  if (!a) return "";

  // Known axes → controlled paraphrases (same meaning, less repetition).
  const rules: Array<{ match: (s: string) => boolean; variants: string[] }> = [
    {
      match: (s) => s.includes("control") && s.includes("territorial") && (s.includes("perman") || s.includes("sosten")),
      variants: [
        "presencia institucional sostenida en el territorio",
        "control y presencia permanente en el territorio",
        "gobernanza territorial con despliegue continuo de seguridad",
      ],
    },
    {
      match: (s) => s.includes("anticorrup") || (s.includes("lucha") && s.includes("corrup")),
      variants: [
        "cero tolerancia a la corrupción con control y sanción",
        "integridad pública con auditoría y transparencia real",
        "blindaje anticorrupción en contratación y ejecución",
      ],
    },
    {
      match: (s) => s.includes("seguridad") && s.includes("legal"),
      variants: ["seguridad con legalidad y reglas claras", "orden y seguridad respetando la ley", "seguridad ciudadana con justicia y legalidad"],
    },
  ];

  for (const r of rules) {
    if (!r.match(a)) continue;
    const i = pickVariantIndex(`${seed}|${a}|axis`, r.variants.length);
    return r.variants[i] ?? r.variants[0]!;
  }

  // Generic light rewrite (synonyms) for other axes.
  const swaps: Array<[RegExp, string[]]> = [
    [/\bpermanente\b/gi, ["sostenida", "constante"]],
    [/\bcontrol\b/gi, ["coordinación", "gestión"]],
    [/\bterritorial\b/gi, ["en el territorio", "territorial"]],
    [/\bseguridad\b/gi, ["protección ciudadana", "seguridad"]],
    [/\bjusticia\b/gi, ["justicia", "debido proceso"]],
    [/\bcorrupción\b/gi, ["corrupción", "malversación"]],
  ];

  let out = stripMarkdownLike(axis);
  for (const [re, vars] of swaps) {
    if (!re.test(out)) continue;
    const i = pickVariantIndex(`${seed}|${re.source}`, vars.length);
    out = out.replace(re, vars[i] ?? vars[0]!);
  }
  return normalizeSpaces(out).slice(0, 110);
}

function pickProposalAxes(args: { proposals: string; hints: string[] }): string[] {
  const raw = String(args.proposals || "");
  if (!raw.trim()) return [];
  const hints = Array.from(new Set((args.hints ?? []).map((h) => String(h || "").toLowerCase()).filter((h) => h.length >= 4))).slice(0, 18);

  const lines = raw
    .split(/\r?\n/g)
    .map((l) => stripMarkdownLike(l))
    .map((l) => l.replaceAll(/\s+/g, " ").trim())
    .filter((l) => l.length >= 10 && l.length <= 110)
    .slice(0, 220);

  const scored = lines
    .map((l) => {
      const low = l.toLowerCase();
      const hit = hints.filter((h) => low.includes(h)).length;
      const civic = ["seguridad", "territorial", "control", "corrup", "empleo", "educ", "legal", "justic", "tecnolog", "polic", "vereda", "barrio"].filter((k) =>
        low.includes(k),
      ).length;
      const score = hit * 3 + civic;
      return { l, score };
    })
    .sort((a, b) => b.score - a.score);

  const picked: string[] = [];
  for (const s of scored) {
    if (picked.length >= 2) break;
    if (!picked.some((p) => p.toLowerCase() === s.l.toLowerCase())) picked.push(s.l);
  }
  return picked;
}

function ensureCandidateAlignmentInBlog(args: {
  text: string;
  candidateName: string;
  ballotNumber: string | number | null;
  office: string;
  proposals: string;
  axisHint: string | null;
  newsHint: string;
}): string {
  const base = normalizeLineBreaks(args.text || "");
  if (!base) return base;
  const name = normalizeSpaces(args.candidateName);
  const ballot = args.ballotNumber ? String(args.ballotNumber).trim() : "";
  const mustToken = ballot ? `tarjetón ${ballot}` : name;
  const lowBase = base.toLowerCase();
  const hasCandidate = name && lowBase.includes(name.toLowerCase());
  const hasBallot = ballot ? lowBase.includes(`tarjetón ${ballot}`) : true;

  const axes = (() => {
    const hints = [
      ...(args.axisHint ? [args.axisHint] : []),
      ...String(args.newsHint || "")
        .split(/\s+/g)
        .map((x) => x.replaceAll(/[^\p{L}\p{N}]+/gu, "").trim())
        .filter(Boolean)
        .slice(0, 10),
    ];
    const picked = pickProposalAxes({ proposals: args.proposals, hints });
    return picked.length ? picked : args.axisHint ? [args.axisHint] : [];
  })();

  const badge = ballot ? `**${name} · Tarjetón ${ballot}**` : `**${name}**`;
  const seed = `${name}|${ballot}|${args.newsHint}`.slice(0, 380);
  const prettyAxes = axes.map((a) => paraphraseAxis(a, seed)).filter(Boolean);
  const axisBits = prettyAxes.length ? prettyAxes : args.axisHint ? [paraphraseAxis(args.axisHint, seed)].filter(Boolean) : [];

  const scope = String(args.office || "").toLowerCase().includes("senado") ? "la agenda nacional" : "el territorio";
  const axisSentence = axisBits.length
    ? `Esto se conecta con su propuesta de ${axisBits.length === 1 ? axisBits[0] : `${axisBits[0]} y ${axisBits[1]}`}.`
    : "Esto se conecta con su propuesta de fortalecer la seguridad con legalidad y presencia institucional.";

  const templates = [
    `${badge} aterriza este tipo de retos con un enfoque práctico: ${axisSentence} En escenarios como este, la prioridad es traducir el análisis en acciones medibles en ${scope}.`,
    `${badge} plantea una ruta clara ante situaciones como la de esta noticia. ${axisSentence} El objetivo es recuperar confianza ciudadana con resultados visibles en ${scope}.`,
    `Cuando el debate se vuelve complejo, hace falta un plan. ${badge} propone actuar con serenidad y firmeza: ${axisSentence} Así se evitan respuestas improvisadas y se fortalece ${scope}.`,
  ];
  const paragraph = templates[pickVariantIndex(`${seed}|tpl`, templates.length)] ?? templates[0]!;

  // Insert after "Cómo encaja..." if present; otherwise insert before "Fuente:" or at end.
  const lines = base.split("\n");
  const idxHow = lines.findIndex((l) => l.toLowerCase().includes("cómo encaja") || l.toLowerCase().includes("como encaja"));
  const idxSource = lines.findIndex((l) => l.toLowerCase().startsWith("fuente:"));
  const insertAt = idxHow >= 0 ? idxHow + 1 : idxSource >= 0 ? idxSource : Math.max(2, lines.length - 1);

  // Avoid duplicating if we already injected a bold badge + alignment cue.
  const hasBadge = name ? lowBase.includes(`**${name.toLowerCase()}`) : false;
  const hasAlignmentCue = lowBase.includes("en su programa") || lowBase.includes("cómo encaja") || lowBase.includes("como encaja");
  const hasMustToken = mustToken ? lowBase.includes(mustToken.toLowerCase()) : false;
  const needs = !hasBadge || !hasAlignmentCue || !hasMustToken || !hasCandidate || !hasBallot;
  if (!needs) return base;

  const next = [...lines.slice(0, insertAt), "", paragraph.trim(), "", ...lines.slice(insertAt)].join("\n").replace(/\n{3,}/g, "\n\n").trim();
  return next;
}

function isBadOgImageUrl(u: string): boolean {
  const s = String(u || "").toLowerCase();
  if (!s) return true;
  // Avoid obvious site assets / logos / icons.
  const badBits = [
    "logo",
    "favicon",
    "icon",
    "sprite",
    "apple-touch-icon",
    "site-icon",
    "brand",
    "avatar",
    "profile",
    "header",
    "footer",
    "default",
    "placeholder",
    "share.png",
    "share.jpg",
  ];
  if (badBits.some((b) => s.includes(b))) return true;
  // Avoid document/PDF renders (common: Wikimedia PDF -> JPG, scanned bulletins/manuals).
  const docBits = [
    ".pdf",
    "pdf.jpg",
    "pdf.png",
    "/page1-",
    "/page2-",
    "/page3-",
    "boletin",
    "boletín",
    "gaceta",
    "manual",
    "juridic",
    "jurídic",
    "resolucion",
    "resolución",
    "decreto",
    "acta",
    "oficio",
    "documento",
    "carta",
  ];
  if (docBits.some((b) => s.includes(b))) return true;
  if (s.endsWith(".svg")) return true;
  return false;
}

function isHotlinkSafeImageUrl(u: string): boolean {
  try {
    const host = new URL(u).host.toLowerCase();
    const allow = [
      "upload.wikimedia.org",
      "commons.wikimedia.org",
      "wikipedia.org",
      new URL(getSiteUrlString()).host.toLowerCase(),
    ];
    return allow.some((h) => host === h || host.endsWith(`.${h}`));
  } catch {
    return false;
  }
}

function stripPublicMetaLines(input: string): string {
  const raw = normalizeLineBreaks(String(input || ""));
  if (!raw) return "";
  const lines = raw.split("\n");
  const kept: string[] = [];
  for (const l of lines) {
    const t = String(l || "").trim();
    if (!t) {
      kept.push("");
      continue;
    }
    const low = t.toLowerCase();
    if (low.startsWith("seo:")) continue;
    if (low.startsWith("imagen:")) continue;
    if (low.startsWith("crédito imagen:") || low.startsWith("credito imagen:")) continue;
    if (low.startsWith("fuente imagen:")) continue;
    // Keep legal notes, but drop "credit to outlet" repetition.
    if (low.startsWith("contenido generado y analizado por")) continue;
    kept.push(t);
  }
  return kept
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function fallbackPublicImageUrl(seed: string): string {
  // Use a real hosted asset (not a data URL) so DB constraints that require http(s) URLs are satisfied.
  const s = String(seed || "mp26").slice(0, 120);
  const v = createHash("sha256").update(s).digest("hex").slice(0, 10);
  return `${getSiteUrlString()}/fallback/news.svg?v=${v}`;
}

async function fetchActiveRssSources(args: {
  admin: ReturnType<typeof createSupabaseAdminClient>;
  region_key: "meta" | "colombia";
}): Promise<RssSource[]> {
  const admin = args.admin;
  if (!admin) return [];
  const { data } = await admin
    .from("news_rss_sources")
    .select("id,name,region_key,base_url,rss_url,active")
    .eq("active", true)
    // Guardrail: only use feeds explicitly confirmed as licensed/allowed for this platform.
    .eq("license_confirmed", true)
    .eq("region_key", args.region_key)
    .order("name", { ascending: true });
  return (data ?? []) as any;
}

function regionKeyFromCandidate(args: { office: string; region: string }): "meta" | "colombia" {
  // National scope (Senado) defaults to Colombia.
  const off = String(args.office || "").toLowerCase();
  if (off.includes("senado")) return "colombia";
  const r = String(args.region || "").toLowerCase();
  if (r.includes("meta")) return "meta";
  // Future-safe fallback: treat unknown regions as Colombia-wide until new region keys are added.
  return "colombia";
}

async function recentUsedNewsUrls(args: {
  admin: ReturnType<typeof createSupabaseAdminClient>;
  candidate_id: string;
}): Promise<string[]> {
  const admin = args.admin;
  if (!admin) return [];
  const urls: string[] = [];
  try {
    // Global recent posts (avoid cross-candidate duplicates)
    const { data: globalPosts } = await admin
      .from("citizen_news_posts")
      .select("source_url")
      .eq("status", "published")
      .order("published_at", { ascending: false })
      .limit(140);
    for (const r of globalPosts ?? []) {
      const u = (r as any)?.source_url;
      if (typeof u === "string" && u.trim()) urls.push(u.trim());
    }

    // Recent published posts for this candidate
    const { data: posts } = await admin
      .from("citizen_news_posts")
      .select("source_url")
      .eq("candidate_id", args.candidate_id)
      .eq("status", "published")
      .order("published_at", { ascending: false })
      .limit(120);
    for (const r of posts ?? []) {
      const u = (r as any)?.source_url;
      if (typeof u === "string" && u.trim()) urls.push(u.trim());
    }

    // Recent drafts for this candidate (kept even if posts are purged)
    const { data: drafts } = await admin
      .from("ai_drafts")
      .select("metadata")
      .eq("candidate_id", args.candidate_id)
      .eq("content_type", "blog")
      .order("created_at", { ascending: false })
      .limit(140);
    for (const d of drafts ?? []) {
      const m = (d as any)?.metadata ?? null;
      const su = m && typeof m.source_url === "string" ? String(m.source_url).trim() : "";
      const ru = m && typeof m.original_rss_url === "string" ? String(m.original_rss_url).trim() : "";
      const nu = m?.news && typeof m.news.url === "string" ? String(m.news.url).trim() : "";
      for (const u of [su, ru, nu]) if (u) urls.push(u);
    }
  } catch {
    // ignore
  }
  return Array.from(new Set(urls.map((u) => u.trim()).filter(Boolean))).slice(0, 240);
}

async function recentUsedMediaUrls(args: {
  admin: ReturnType<typeof createSupabaseAdminClient>;
  candidate_id: string;
}): Promise<string[]> {
  const admin = args.admin;
  if (!admin) return [];
  const urls: string[] = [];
  try {
    // Global recent media (avoid repeating the same visuals across candidates)
    const { data: globalPosts } = await admin
      .from("citizen_news_posts")
      .select("media_urls")
      .eq("status", "published")
      .order("published_at", { ascending: false })
      .limit(140);
    for (const r of globalPosts ?? []) {
      const arr = Array.isArray((r as any)?.media_urls) ? ((r as any).media_urls as unknown[]) : [];
      for (const u of arr) if (typeof u === "string" && u.trim()) urls.push(u.trim());
    }

    // Published posts (candidate)
    const { data: posts } = await admin
      .from("citizen_news_posts")
      .select("media_urls")
      .eq("candidate_id", args.candidate_id)
      .eq("status", "published")
      .order("published_at", { ascending: false })
      .limit(120);
    for (const r of posts ?? []) {
      const arr = Array.isArray((r as any)?.media_urls) ? ((r as any).media_urls as unknown[]) : [];
      for (const u of arr) if (typeof u === "string" && u.trim()) urls.push(u.trim());
    }

    // Drafts metadata (survives even if posts are purged)
    const { data: drafts } = await admin
      .from("ai_drafts")
      .select("generated_text,metadata")
      .eq("candidate_id", args.candidate_id)
      .eq("content_type", "blog")
      .order("created_at", { ascending: false })
      .limit(160);
    for (const d of drafts ?? []) {
      const m = (d as any)?.metadata ?? null;
      const mu = m?.media && typeof m.media.image_url === "string" ? String(m.media.image_url).trim() : "";
      if (mu) urls.push(mu);
      const gt = typeof (d as any)?.generated_text === "string" ? String((d as any).generated_text) : "";
      const mm = gt.match(/Imagen:\s*(https?:\/\/\S+)/i)?.[1] ?? "";
      if (mm) urls.push(String(mm).trim());
    }
  } catch {
    // ignore
  }
  return Array.from(new Set(urls.map((u) => u.trim()).filter(Boolean))).slice(0, 300);
}

function chooseNewsSignal(args: {
  gdelt: import("@/lib/news/gdelt").GdeltArticle | null;
  rss: RssItem | null;
  prefer_rss?: boolean;
}): { type: "gdelt"; article: import("@/lib/news/gdelt").GdeltArticle } | { type: "rss"; item: RssItem } | null {
  // RSS is additive: use it when it's present and GDELT is missing, or when RSS is explicitly preferred.
  if (args.rss && (!args.gdelt || args.prefer_rss)) return { type: "rss", item: args.rss };
  if (args.gdelt) return { type: "gdelt", article: args.gdelt };
  return null;
}

function appendPublicFooter(args: {
  text: string;
  based_on_source_name?: string | null;
}): string {
  const base = String(args.text || "").trim();
  const lines: string[] = [base];

  if (args.based_on_source_name) {
    lines.push("", `Basado en información publicada por ${args.based_on_source_name}.`);
  }

  lines.push(
    "",
    "Contenido generado y analizado por Marleny Synthetic Intelligence by MarketBrain Technology™.",
    "Publicidad política pagada. El creador del contenido no es responsable de las opiniones aquí expresadas.",
    "Contenido de carácter informativo y publicitario conforme a la normativa electoral colombiana.",
  );

  return lines.filter(Boolean).join("\n");
}

function appendPublicFooterShort(args: { text: string; based_on_source_name?: string | null }): string {
  const base = String(args.text || "").trim();
  const bits: string[] = [base];
  if (args.based_on_source_name) bits.push(`(Basado en ${args.based_on_source_name})`);
  bits.push(
    "MSI by MarketBrain™.",
    "Publicidad política pagada. El creador no es responsable de opiniones.",
    "Info/publicidad conforme normativa electoral colombiana.",
  );
  return bits.filter(Boolean).join(" ");
}

export async function POST(req: Request) {
  // Automation endpoint: server-to-server only (n8n/cron/internal services).
  // Admin UI must call /api/admin/automation/editorial-orchestrate.
  const url = new URL(req.url);
  const testMode = url.searchParams.get("test") === "true";

  // Token-only: no browser, no session.
  if (!allowAutomation(req)) {
    if (isBrowserOrigin(req)) {
      console.warn("[editorial-orchestrate] rejected_browser_origin", { path: "/api/automation/editorial-orchestrate" });
      return NextResponse.json({ error: "forbidden" }, { status: 403 });
    }
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const requestId = (() => {
    try {
      return randomUUID();
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
  const news_mode_raw = typeof b.news_mode === "string" ? b.news_mode.trim().toLowerCase() : "";
  const news_mode: RssPickMode = news_mode_raw === "viral" ? "viral" : news_mode_raw === "any" ? "any" : "grave";
  if (!candidate_id) return NextResponse.json({ error: "candidate_id_required" }, { status: 400 });
  if (max_items < 1 || max_items > 2) return NextResponse.json({ error: "max_items_invalid" }, { status: 400 });

  const adminProvidedNewsLinks = Array.isArray(b.news_links) ? (b.news_links.filter((x) => typeof x === "string") as string[]) : [];
  const adminEditorialNotes = typeof b.editorial_notes === "string" ? b.editorial_notes.trim() : "";

  // Editorial tuning (backend-only; future-configurable via metadata)
  const inclinationRaw = typeof b.editorial_inclination === "string" ? b.editorial_inclination.trim().toLowerCase() : "";
  const editorial_inclination: "informativo" | "persuasivo_suave" | "correctivo" =
    inclinationRaw === "informativo"
      ? "informativo"
      : inclinationRaw === "persuasivo_suave" || inclinationRaw === "persuasivo"
        ? "persuasivo_suave"
        : inclinationRaw === "correctivo"
          ? "correctivo"
          : "informativo";
  const styleRaw = typeof b.editorial_style === "string" ? b.editorial_style.trim().toLowerCase() : "";
  const editorial_style: "noticiero_portada" | "sobrio" = styleRaw === "sobrio" ? "sobrio" : "noticiero_portada";

  const admin = createSupabaseAdminClient();
  if (!admin) return NextResponse.json({ error: "supabase_not_configured" }, { status: 503 });

  // Safe logging (no secrets)
  console.info("[editorial-orchestrate] request", {
    requestId,
    candidate_id,
    max_items,
    testMode,
    news_mode,
    actor: "automation",
  });

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

  const candidate_scope: "national" | "regional" = String(pol.office || "").toLowerCase().includes("senado") ? "national" : "regional";

  console.info("[editorial-orchestrate] candidate_resolved", {
    requestId,
    candidate: { id: pol.id, slug: pol.slug, office: pol.office, region: pol.region },
  });

  // Admin-provided inputs (phase-1, backend-only):
  // - uploaded media references from Storage (no scraping)
  // These are included as preferred embed references in prompts/metadata.
  let recentMediaUrls: string[] = [];
  const includeRecentMedia = String(process.env.MP26_INCLUDE_RECENT_MEDIA ?? "").trim().toLowerCase() === "true";
  if (includeRecentMedia) {
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
  const regional = regionalProvidersForCandidate({ office: pol.office, region: pol.region });

  // 1) Admin inputs first (if provided by automation caller)
  const hasAdminInputs = adminProvidedNewsLinks.length > 0 || adminEditorialNotes.length > 0 || recentMediaUrls.length > 0;

  const avoidNewsUrls = adminProvidedNewsLinks.length ? [] : await recentUsedNewsUrls({ admin, candidate_id: pol.id });

  // RSS additive signal (only when no admin-provided news)
  const regionKey = regionKeyFromCandidate({ office: pol.office, region: pol.region });
  const rssSources = adminProvidedNewsLinks.length ? [] : await fetchActiveRssSources({ admin, region_key: regionKey });
  const rssItem =
    adminProvidedNewsLinks.length
      ? null
      : await pickTopRssItem({
          sources: rssSources,
          query_terms: [
            pol.region,
            pol.office,
            "Colombia",
            "seguridad",
            "corrupción",
            ...(regionKey === "meta" ? ["Meta", "Villavicencio", "Acacías", "Granada (Meta)"] : []),
          ]
            .filter(Boolean)
            .map(String),
          avoid_urls: avoidNewsUrls,
          mode: news_mode,
        });

  // 2) News selection (GDELT) only if no admin-provided news links
  const gdeltArticle = adminProvidedNewsLinks.length
    ? null
    : news_mode === "viral"
      ? await fetchViralNewsArticle({ office: pol.office, region: pol.region, regional_hints: regional.url_hints, avoid_urls: avoidNewsUrls })
      : await fetchBestNewsArticle({ office: pol.office, region: pol.region, regional_hints: regional.url_hints, avoid_urls: avoidNewsUrls });

  // Decide which signal to use (RSS is additive; never exclusive).
  const chosen = chooseNewsSignal({ gdelt: gdeltArticle, rss: rssItem, prefer_rss: Boolean(rssItem) });
  const article = chosen?.type === "gdelt" ? chosen.article : null;
  const rssChosen = chosen?.type === "rss" ? chosen.item : null;

  // 2) If no news, fallback: last published post (for reframing)
  const { data: lastPublished } = await admin
    .from("citizen_news_posts")
    .select("id,title,body,source_url,media_urls,published_at")
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
    `- Tipo de noticia priorizada: ${news_mode === "viral" ? "VIRAL / conversación pública" : "GRAVE / alto impacto cívico"}.`,
    `- Estilo editorial: ${editorial_style === "noticiero_portada" ? "noticiero tipo periódico/portada (titular fuerte pero sobrio, lead claro, orden visual)" : "sobrio"}.`,
    `- Inclinación: ${editorial_inclination}.`,
    "  - informativo: neutral, explica hechos y contexto. Persuasión mínima (cívica).",
    "  - persuasivo_suave: resalta 1–2 ejes del programa como solución/fortaleza (capacidad y plan), buscando intención de voto de forma ética: sin ataques, sin propaganda explícita, sin llamados directos tipo 'vote por X'.",
    "  - correctivo: cuando la noticia es negativa, enfoque de control institucional/soluciones; evita culpabilizar personas o lenguaje extremo.",
    "- Español (Colombia).",
    "- Si la noticia/titular está en inglés, traduce y redacta TODO el resultado final en español (Colombia).",
    "- Informativo, propositivo, no agresivo, no propagandístico.",
    "- No inventar datos/cifras; no ataques personales; no urgencia falsa.",
    "- Debe ser coherente con la biografía y propuestas del candidato.",
    "- Debe explicar explícitamente cómo 1–2 ejes/puntos de la propuesta del candidato aportan a prevenir/mitigar/solucionar (si es negativo) o potenciar (si es positivo).",
    "- Debe cambiar (reescribir) el título de la noticia real: no copies literal el titular del medio.",
    "- Debe incluir el nombre del candidato y su número de tarjetón cuando se mencione su implicación.",
    "- Debe incluir un cierre tipo 'derecho ciudadano al voto' (reformulado cada vez, no literal).",
    "- Incluye link relativo a /centro-informativo en facebook/x (sin URL absoluta).",
    "- Variants:",
    "  - blog: 500–800 palabras (OBLIGATORIO). Presentación atractiva:",
    "    - Primera línea: Título (<=120 caracteres)",
    "    - Luego 1 lead corto",
    "    - Secciones sugeridas: “Qué pasó”, “Por qué importa”, “Cómo encaja con la propuesta del candidato”, “Qué sigue / Recomendaciones”",
    "    - Cierra con: “Fuente:” (si existe), “Hashtags:” (3+) y una línea final 'Mensaje ciudadano:' (con la idea del voto como derecho y líderes proactivos).",
    "  - facebook: 700-900 caracteres.",
    "  - x: <=280 o mini-hilo (3 partes) separadas por \\n\\n---\\n\\n.",
    "  - reddit: 6-10 líneas, tono analítico y abierto a discusión.",
    "",
    "Señal editorial (prioridad local, NO obligatorio):",
    `- Región usada para sourcing: ${regional.region_used}`,
    `- Fuentes preferidas: ${regional.preferred_sources.join(", ") || "(ninguna)"}`,
    "Puedes usar medios nacionales si el tema afecta la región o si no hay buena cobertura local.",
    "",
    `Candidato: ${pol.name} (${pol.office})`,
    `Alcance: ${candidate_scope === "national" ? "nacional (Colombia)" : `regional (${pol.region || "región"})`}`,
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
    rssChosen
      ? `Noticia RSS (señal adicional):\nMedio: ${rssChosen.source_name}\nTitular: ${rssChosen.title}\nURL: ${rssChosen.url}\nFecha: ${
          rssChosen.published_at ?? ""
        }`
      : "",
    !rssChosen && article ? "Noticia automática (GDELT):" : "",
    !rssChosen && article ? `Titular: ${article.title}` : "",
    !rssChosen && article ? `URL: ${article.url}` : "",
    !rssChosen && article ? `Fecha: ${article.seendate}` : "",
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
    const plainTopic = [
      "Redacta SOLO el artículo del Centro Informativo (NO JSON).",
      "Reglas:",
      "- Español (Colombia).",
      "- 500–800 palabras (OBLIGATORIO).",
      "- Primera línea: TÍTULO reescrito (no copies literal el titular del medio).",
      "- Estructura: Qué pasó / Por qué importa / Cómo encaja con 1–2 ejes del programa / Qué sigue.",
      "- Incluye el nombre del candidato y su número de tarjetón cuando menciones su implicación.",
      "- Cierra con: Fuente: <url> (si existe), Hashtags: (3+), Mensaje ciudadano: (reformulado).",
      "- Incluye una línea 'SEO:' con 6–10 keywords (separadas por coma).",
      "",
      promptContext,
    ].join("\n");

    // If the first attempt fails (timeout/upstream), try one more time in plain-text mode.
    if (!wrapped.ok || !wrapped.value || !(wrapped.value as any).ok) {
      const err = !wrapped.ok ? wrapped.error : ((wrapped.value as any)?.error ?? "failed");
      if (err === "disabled" || err === "not_configured") return { ok: false, engine: "MSI", ms, error: err };

      const wrappedPlain = await withTimeout(
        callMarlenyAI({
          candidateId: pol.id,
          contentType: "blog",
          topic: plainTopic,
          tone: "editorial sobrio, institucional, humano",
        }),
        32000,
      );
      if (!wrappedPlain.ok) return { ok: false, engine: "MSI", ms, error: "timeout" };
      if (!wrappedPlain.value?.ok) return { ok: false, engine: "MSI", ms, error: "upstream_error" };

      const blogRaw = String(wrappedPlain.value.text ?? "").trim();
      if (!blogRaw) return { ok: false, engine: "MSI", ms, error: "bad_response" };
      const seo = extractSeoFromText(blogRaw);
      const blog = stripSeoLine(blogRaw);
      const filled = synthesizeVariants({ blog, candidate: { name: pol.name, ballot_number: pol.ballot_number }, seo_keywords: seo });
      const data: EngineOutput = {
        sentiment: "neutral",
        seo_keywords: filled.seo_keywords,
        master_editorial: filled.master_editorial,
        platform_variants: filled.platform_variants,
      };
      if (!baselineValidText(data, pol.name)) return { ok: false, engine: "MSI", ms, error: "bad_response" };
      return { ok: true, engine: "MSI", ms, data, raw: blogRaw };
    }

    const r = wrapped.value as any;
    const raw = String(r?.text ?? "");
    const parsed = tryExtractJsonObject(raw);
    let data = extractEngineOutput(parsed);

    // Fallback: if MSI couldn't/wouldn't return strict JSON, request a plain blog and synthesize structure.
    if (!data) {
      const wrapped2 = await withTimeout(
        callMarlenyAI({
          candidateId: pol.id,
          contentType: "blog",
          topic: plainTopic,
          tone: "editorial sobrio, institucional, humano",
        }),
        32000,
      );
      if (!wrapped2.ok) return { ok: false, engine: "MSI", ms, error: "timeout" };
      if (!wrapped2.value?.ok) return { ok: false, engine: "MSI", ms, error: "bad_response" };

      const blogRaw = String(wrapped2.value.text ?? "").trim();
      if (!blogRaw) return { ok: false, engine: "MSI", ms, error: "bad_response" };

      const seo = extractSeoFromText(blogRaw);
      const blog = stripSeoLine(blogRaw);
      const filled = synthesizeVariants({
        blog: ensureCandidateMention(blog, { name: pol.name, ballot_number: pol.ballot_number }),
        candidate: { name: pol.name, ballot_number: pol.ballot_number },
        seo_keywords: seo,
      });
      data = {
        sentiment: "neutral",
        seo_keywords: filled.seo_keywords,
        master_editorial: filled.master_editorial,
        platform_variants: filled.platform_variants,
      };
    }

    // Ensure the blog always mentions candidate+ballot somewhere.
    (data as any).platform_variants = {
      ...data.platform_variants,
      blog: ensureCandidateMention(data.platform_variants.blog, { name: pol.name, ballot_number: pol.ballot_number }),
    };
    if (!baselineValidText(data, pol.name)) return { ok: false, engine: "MSI", ms, error: "bad_response" };
    // Backfill missing fields/variants defensively.
    const filled = synthesizeVariants({
      blog: data.platform_variants.blog,
      candidate: { name: pol.name, ballot_number: pol.ballot_number },
      seo_keywords: data.seo_keywords,
    });
    (data as any).seo_keywords = filled.seo_keywords;
    (data as any).master_editorial = data.master_editorial?.trim() ? data.master_editorial : filled.master_editorial;
    (data as any).platform_variants = {
      blog: data.platform_variants.blog,
      facebook: data.platform_variants.facebook?.trim() ? data.platform_variants.facebook : filled.platform_variants.facebook,
      x: data.platform_variants.x?.trim() ? data.platform_variants.x : filled.platform_variants.x,
      reddit: data.platform_variants.reddit?.trim() ? data.platform_variants.reddit : filled.platform_variants.reddit,
    };
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
    if (!r?.ok)
      return {
        ok: false,
        engine: "OpenAI",
        ms,
        error: (r?.error as any) ?? "failed",
        ...(r && (r as any).meta ? { meta: (r as any).meta } : {}),
      };
    const data = extractEngineOutput(r.data);
    if (!data) return { ok: false, engine: "OpenAI", ms, error: "bad_response" };
    (data as any).platform_variants = {
      ...data.platform_variants,
      blog: ensureCandidateMention(data.platform_variants.blog, { name: pol.name, ballot_number: pol.ballot_number }),
    };
    if (!baselineValidText(data, pol.name)) return { ok: false, engine: "OpenAI", ms, error: "bad_response" };
    const filled = synthesizeVariants({ blog: data.platform_variants.blog, candidate: { name: pol.name, ballot_number: pol.ballot_number }, seo_keywords: data.seo_keywords });
    (data as any).seo_keywords = filled.seo_keywords;
    (data as any).master_editorial = data.master_editorial?.trim() ? data.master_editorial : filled.master_editorial;
    (data as any).platform_variants = {
      blog: data.platform_variants.blog,
      facebook: data.platform_variants.facebook?.trim() ? data.platform_variants.facebook : filled.platform_variants.facebook,
      x: data.platform_variants.x?.trim() ? data.platform_variants.x : filled.platform_variants.x,
      reddit: data.platform_variants.reddit?.trim() ? data.platform_variants.reddit : filled.platform_variants.reddit,
    };
    return { ok: true, engine: "OpenAI", ms, data, raw: JSON.stringify(r.data) };
  }

  // Run both in parallel, but prefer OpenAI first (internal preference; not user-visible).
  const msiP = runMsi();
  const oaP = runOpenAi();

  const results: Record<EngineName, EngineResult | null> = { MSI: null, OpenAI: null };

  const oa = await oaP;
  results.OpenAI = oa;
  let winner: (EngineResult & { ok: true }) | null = oa.ok ? (oa as any) : null;

  const msi = await msiP;
  results.MSI = msi;
  if (!winner && msi.ok) winner = msi as any;

  if (!winner) {
    console.warn("[editorial-orchestrate] no_valid_engine_output", {
      requestId,
      candidate_id: pol.id,
      msi: msi?.ok ? { ok: true, ms: (msi as any).ms } : { ok: false, ms: msi?.ms, error: msi?.error },
      openai: oa?.ok ? { ok: true, ms: (oa as any).ms } : { ok: false, ms: oa?.ms, error: oa?.error },
    });

    const openAiMeta = (oa && !oa.ok && (oa as any).meta) || null;
    return NextResponse.json(
      {
        ok: false,
        error: "no_valid_engine_output",
        request_id: requestId,
        engines: {
          MSI: msi?.ok ? { ok: true, ms: msi.ms } : { ok: false, ms: msi?.ms ?? null, error: msi?.error ?? null },
          OpenAI: oa?.ok
            ? { ok: true, ms: oa.ms }
            : { ok: false, ms: oa?.ms ?? null, error: oa?.error ?? null, ...(openAiMeta ? { meta: openAiMeta } : {}) },
        },
      },
      { status: 502 },
    );
  }

  // Enforce Spanish (Colombia) before persisting.
  const combined = `${winner.data.master_editorial}\n${winner.data.platform_variants.blog}\n${winner.data.platform_variants.facebook}\n${winner.data.platform_variants.x}\n${winner.data.platform_variants.reddit}`;
  if (!isLikelySpanish(combined)) {
    const rewritten = await rewriteToSpanishColombia({ pol, out: winner.data });
    if (rewritten) {
      console.info("[editorial-orchestrate] rewritten_to_spanish", { requestId, candidate_id: pol.id, source_engine: winner.engine });
      (winner as any).data = rewritten;
    } else {
      console.warn("[editorial-orchestrate] non_spanish_output", { requestId, candidate_id: pol.id, source_engine: winner.engine });
    }
  }

  const arbitration_reason = (() => {
    if (winner.engine === "OpenAI") return "openai_preferred";
    if (oa && !oa.ok && oa.error === "timeout") return "openai_timeout";
    if (oa && !oa.ok) return "openai_error";
    return "msi_fallback";
  })();

  // Enforce target blog length (best-effort) before persisting.
  const wc = wordCount(winner.data.platform_variants.blog);
  if (wc < 500 || wc > 800) {
    const topic = [
      "Ajusta SOLO el contenido del JSON para cumplir longitud y estructura del blog.",
      "Reglas:",
      "- Devuelve SOLO JSON con el MISMO esquema.",
      "- Mantén hechos verificables (sin inventar cifras/datos).",
      "- Blog: 500–800 palabras (OBLIGATORIO).",
      "- Debe explicar cómo 1–2 ejes de propuesta del candidato aportan a la situación.",
      "- Conserva hashtags (3+) y 'Fuente:' si existe.",
      "- Integra 3–5 SEO keywords dentro del texto de forma natural.",
      "",
      "JSON (entrada):",
      JSON.stringify(winner.data),
    ].join("\\n");

    const wrapped = await withTimeout(
      callMarlenyAI({
        candidateId: pol.id,
        contentType: "blog",
        topic,
        tone: "editorial sobrio, institucional, humano",
      }),
      25000,
    );

    let adjusted: EngineOutput | null = null;
    if (wrapped.ok && wrapped.value?.ok) {
      const parsed = tryExtractJsonObject(String(wrapped.value.text ?? ""));
      const data = extractEngineOutput(parsed);
      if (data && baselineValidText(data, pol.name)) adjusted = data;
    }

    // Fallback: if MSI is down, adjust using Volume (OpenAI-compatible).
    if (!adjusted) {
      const oaAdj = await withTimeout(
        openAiJson<EngineOutput>({
          task: "editorial_adjust_length",
          system:
            "Eres un editor cívico para Colombia. Ajusta el JSON para cumplir reglas de longitud/estructura/SEO sin inventar datos. " +
            "Responde SOLO JSON con el esquema indicado.",
          user: topic,
        }),
        20000,
      );
      if (oaAdj.ok && oaAdj.value?.ok) {
        const data = extractEngineOutput(oaAdj.value.data);
        if (data && baselineValidText(data, pol.name)) adjusted = data;
      }
    }

    if (adjusted) (winner as any).data = adjusted;
  }

  // Pick a CC image (Wikimedia) and store attribution (best-effort).
  const avoidUrls: string[] = [];
  try {
    const prevBody = lastPublished?.body ? String(lastPublished.body) : "";
    const m = prevBody.match(/https?:\/\/upload\.wikimedia\.org\/[^\s)]+/i);
    if (m?.[0]) avoidUrls.push(m[0]);
    const prevMedia = Array.isArray((lastPublished as any)?.media_urls) ? ((lastPublished as any).media_urls as unknown[]) : [];
    for (const u of prevMedia) {
      if (typeof u === "string" && u.trim()) avoidUrls.push(u.trim());
    }

    // Avoid repeating images even if posts are purged.
    const recentDraftMedia = await recentUsedMediaUrls({ admin, candidate_id: pol.id });
    for (const u of recentDraftMedia) if (typeof u === "string" && u.trim()) avoidUrls.push(u.trim());

    // Avoid repeating images across recent posts (candidate + global).
    const { data: recentCandidatePosts } = await admin
      .from("citizen_news_posts")
      .select("media_urls")
      .eq("status", "published")
      .eq("candidate_id", pol.id)
      .order("published_at", { ascending: false })
      .limit(30);
    for (const row of recentCandidatePosts ?? []) {
      const urls = Array.isArray((row as any)?.media_urls) ? ((row as any).media_urls as unknown[]) : [];
      for (const u of urls) if (typeof u === "string" && u.trim()) avoidUrls.push(u.trim());
    }

    const { data: recentGlobalPosts } = await admin
      .from("citizen_news_posts")
      .select("media_urls")
      .eq("status", "published")
      .order("published_at", { ascending: false })
      .limit(60);
    for (const row of recentGlobalPosts ?? []) {
      const urls = Array.isArray((row as any)?.media_urls) ? ((row as any).media_urls as unknown[]) : [];
      for (const u of urls) if (typeof u === "string" && u.trim()) avoidUrls.push(u.trim());
    }
  } catch {
    // ignore
  }

  // IMPORTANT (rights & reliability):
  // - We do NOT publish/hotlink outlet images (OpenGraph/Twitter cards) because licenses are unclear and hotlinking often fails.
  // - We only publish CC images (Wikimedia) or our own fallback placeholder.
  const sourceUrl = rssChosen?.url ?? article?.url ?? null;
  const og = sourceUrl ? await fetchOpenGraphMedia({ url: sourceUrl }) : null;
  const ogRefImageUrl =
    og?.image_url && !avoidUrls.includes(og.image_url) && !isBadOgImageUrl(og.image_url) ? og.image_url : null;

  const imageQueryPrimary = [
    ...(winner.data.image_keywords?.slice(0, 4) ?? []),
    ...(winner.data.seo_keywords?.slice(0, 2) ?? []),
    pol.region,
    "Colombia",
  ]
    .filter(Boolean)
    .join(" ");

  // Commons search is sensitive: policy keywords can bias results towards PDFs/scans.
  // Strategy:
  // 1) Try the semantic query (keywords + geo).
  // 2) If no CC image found, retry with a geo/photo-biased query for consistent visuals.
  // Keep fallbacks intentionally broad; over-constraining Commons search can yield zero hits.
  const imageQueryGeoFallback = [pol.region, "Colombia", "paisaje", "fotografía"].filter(Boolean).join(" ");
  const imageQueryCivicPhotoFallback = [pol.region, "Colombia", "ciudad", "calle", "gente", "fotografía"].filter(Boolean).join(" ");

  let pickedImage = await pickWikimediaImage({ query: imageQueryPrimary, avoid_urls: avoidUrls });
  let imageQueryUsed: string = imageQueryPrimary;
  if (!pickedImage) {
    const retry = await pickWikimediaImage({ query: imageQueryGeoFallback, avoid_urls: avoidUrls });
    if (retry) {
      pickedImage = retry;
      imageQueryUsed = imageQueryGeoFallback;
    }
  }
  if (!pickedImage) {
    const retry2 = await pickWikimediaImage({ query: imageQueryCivicPhotoFallback, avoid_urls: avoidUrls });
    if (retry2) {
      pickedImage = retry2;
      imageQueryUsed = imageQueryCivicPhotoFallback;
    }
  }

  // If we couldn't find a CC image, generate a first-party image (MSI/OpenAI) and store it in Supabase Storage.
  // This avoids hotlinking and improves reliability/performance.
  const newsTitleHint = rssChosen?.title ?? article?.title ?? lastPublished?.title ?? "";
  const aiPrompt = [
    "Imagen ilustrativa editorial para una nota cívica en Colombia (no propaganda).",
    "Requisitos: sin texto, sin logos, sin marcas de agua, sin banderas explícitas, sin símbolos partidistas.",
    "Sin rostros identificables (si aparecen personas, que sean genéricas y no reconocibles).",
    "Sin violencia explícita, sin sangre, sin armas visibles. Evitar escenas comprometedoras.",
    "No recrear hechos reales específicos: evitar que parezca una foto de un incidente real. Representar el tema de forma simbólica/ambiental.",
    `Contexto regional: ${pol.region || "Colombia"}.`,
    newsTitleHint ? `Tema/titular (contexto): ${newsTitleHint}` : "",
    "Estilo: ilustración editorial moderna con realismo fotográfico (stock-like), creíble, sobria y atractiva; luz natural/cinemática suave.",
    "Composición: regla de tercios, profundidad de campo suave, sujeto urbano/institucional relacionado con el tema (ciudad, institución, servicio público, reunión comunitaria).",
  ]
    .filter(Boolean)
    .join("\n");

  const aiStored =
    !pickedImage && admin
      ? await generateAndStoreNewsImage({
          admin,
          candidateId: pol.id,
          seed: `${pol.slug}-${requestId}`,
          prompt: aiPrompt,
          maxMs: 18_000,
        })
      : null;

  const finalImageUrl = pickedImage?.thumb_url ?? pickedImage?.image_url ?? (aiStored && aiStored.ok ? aiStored.public_url : null);
  const finalImageUrlSafe = finalImageUrl || fallbackPublicImageUrl(`${pol.id}-${imageQueryUsed}-${Date.now()}`);

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
    editorial: { style: editorial_style, inclination: editorial_inclination, candidate_scope },
    region_used: regional.region_used,
    preferred_sources: regional.preferred_sources,
    admin_inputs: {
      provided_news_links: adminProvidedNewsLinks.length ? adminProvidedNewsLinks.slice(0, 10) : [],
      editorial_notes: adminEditorialNotes || null,
      recent_media_urls: recentMediaUrls,
    },
    // Compatibility: allow other routes/UIs to read a canonical source URL.
    source_url: sourceUrl ?? (adminProvidedNewsLinks[0] ?? null),
    source_type: rssChosen ? "rss" : "other",
    source_name: rssChosen ? rssChosen.source_name : article ? "gdelt" : null,
    source_region: rssChosen ? rssChosen.source_region : regional.region_used,
    original_rss_url: rssChosen ? rssChosen.url : null,
    has_rss_image: rssChosen ? Boolean(rssChosen.rss_image_urls?.length) : false,
    // RSS images are reference-only, never published.
    rss_image_urls: rssChosen ? (rssChosen.rss_image_urls ?? []).slice(0, 4) : [],
    image_source: pickedImage ? "wikimedia_commons" : aiStored && aiStored.ok ? "first_party_ai" : "fallback_svg",
    reference_media: ogRefImageUrl
      ? {
          type: "image",
          image_url: ogRefImageUrl,
          page_url: sourceUrl ?? null,
          source: "article_og_reference_only",
        }
      : null,
    image_query: imageQueryUsed,
    media: pickedImage
      ? {
          type: "image",
          image_url: finalImageUrlSafe,
          page_url: pickedImage.page_url,
          license_short: pickedImage.license_short,
          attribution: pickedImage.attribution,
          author: pickedImage.author,
          source: pickedImage.source,
        }
      : aiStored && aiStored.ok
        ? {
            type: "image",
            image_url: aiStored.public_url,
            page_url: null,
            license_short: "first_party_ai",
            attribution: `Imagen ilustrativa generada por ${aiStored.provider} (first-party) · MarketBrain Technology™.`,
            author: null,
            source: "first_party_ai",
          }
        : {
            type: "image",
            image_url: finalImageUrlSafe,
            page_url: sourceUrl ?? null,
            license_short: "fallback_svg",
            attribution: "Imagen ilustrativa local (placeholder editorial).",
            author: null,
            source: "fallback_svg",
          },
    news: rssChosen
      ? { provider: "rss", title: rssChosen.title, url: rssChosen.url, published_at: rssChosen.published_at, query }
      : article
        ? { provider: "gdelt", title: article.title, url: article.url, seendate: article.seendate, query }
      : lastPublished
        ? { provider: "fallback", from: "citizen_news_posts", title: lastPublished.title, source_url: lastPublished.source_url }
        : { provider: "none", query },
    sentiment: winner.data.sentiment,
    seo_keywords: winner.data.seo_keywords,
    master_editorial: winner.data.master_editorial,
  };

  const topic = rssChosen ? `Noticias RSS: ${rssChosen.title}` : article ? `Noticias: ${article.title}` : "Noticias: (sin titular; reescritura editorial)";

  // Subtitle must mention the candidate; title must NOT mention them.
  const axis = deriveEditorialAxisFromProposals(String(pol.proposals || "")) ?? null;
  const subtitle = buildSubtitle({ candidateName: pol.name, office: pol.office, axis, ballotNumber: pol.ballot_number ?? null });

  const blogWithCredits = (() => {
    const baseRaw = normalizeLineBreaks(winner.data.platform_variants.blog || "");
    const base = ensureSeoLine(baseRaw, winner.data.seo_keywords);
    // Enforce sanitized headline on first line (no candidate mentions).
    const lines = base.split("\n");
    const first = (lines.find((l) => l.trim().length > 0) ?? "").trim();
    const safeTitle = sanitizeHeadline({
      titleLine: first,
      candidateName: pol.name,
      ballotNumber: pol.ballot_number ?? null,
      region: pol.region ?? null,
    });
    const rebuilt = safeTitle ? [safeTitle, ...lines.slice(1)].join("\n").trim() : base.trim();
    const m = (metadata as any)?.media as Record<string, unknown> | null;
    const mm = m ?? {};
    const imageUrl = typeof (mm as any).image_url === "string" ? String((mm as any).image_url) : null;
    if (!imageUrl) return rebuilt;
    const creditBits = [
      typeof (mm as any).attribution === "string" ? String((mm as any).attribution) : null,
      typeof (mm as any).author === "string" ? `Autor: ${String((mm as any).author)}` : null,
      typeof (mm as any).license_short === "string" ? `Licencia: ${String((mm as any).license_short)}` : null,
      typeof (mm as any).page_url === "string" ? `Fuente imagen: ${String((mm as any).page_url)}` : null,
    ].filter(Boolean);
    const creditLine = creditBits.length ? `Crédito imagen: ${creditBits.join(" · ")}` : null;
    const imgLine = `Imagen: ${imageUrl}`;
    const withImg = [rebuilt.trim(), "", imgLine, creditLine].filter(Boolean).join("\n");
    // Append public footer (signature + disclaimers), and RSS credit when applicable.
    const sourceNameForCredit = rssChosen ? rssChosen.source_name : null;
    const withFooter = appendPublicFooter({ text: withImg, based_on_source_name: sourceNameForCredit });
    // Hard requirement: always tie the news back to 1–2 proposal axes and include candidate + ballot in bold.
    return ensureCandidateAlignmentInBlog({
      text: withFooter,
      candidateName: pol.name,
      ballotNumber: pol.ballot_number ?? null,
      office: pol.office,
      proposals: String(pol.proposals || ""),
      axisHint: axis,
      newsHint: rssChosen?.title ?? article?.title ?? "",
    });
  })();

  // Persist: generated_text is the BLOG variant (Centro Informativo Ciudadano).
  // Variants: canonical per-network variants must exist BEFORE n8n.
  // - Keep blog for internal use (Centro Informativo).
  // - Ensure: facebook/instagram/threads/x/telegram/reddit always present.
  const baseVariants = {
    blog: blogWithCredits,
    facebook: appendPublicFooter({
      text: normalizeLineBreaks(winner.data.platform_variants.facebook),
      based_on_source_name: rssChosen ? rssChosen.source_name : null,
    }),
    x: appendPublicFooterShort({
      text: normalizeLineBreaks(winner.data.platform_variants.x),
      based_on_source_name: rssChosen ? rssChosen.source_name : null,
    }),
    reddit: appendPublicFooter({
      text: normalizeLineBreaks(winner.data.platform_variants.reddit),
      based_on_source_name: rssChosen ? rssChosen.source_name : null,
    }),
  };
  const ensured = ensureSocialVariants({
    baseText: blogWithCredits,
    blogText: blogWithCredits,
    variants: baseVariants as any,
    seo_keywords: winner.data.seo_keywords,
    candidate: { name: pol.name, ballot_number: pol.ballot_number },
  });
  const variantsJson = {
    blog: blogWithCredits,
    facebook: ensured.facebook,
    instagram: ensured.instagram,
    threads: ensured.threads,
    x: ensured.x,
    telegram: ensured.telegram,
    reddit: ensured.reddit,
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
      generated_text: blogWithCredits,
      variants: variantsJson,
      metadata,
      image_keywords,
      source: "n8n",
      status: "draft",
      subtitle,
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

  // Global auto toggle (app_settings) acts as a hard-stop for automated publishing.
  // If OFF: we still generate drafts, but we do NOT auto-publish nor forward to n8n.
  let globalAutoEnabled = true;
  try {
    const { data } = await admin.from("app_settings").select("value").eq("key", "auto_blog_global_enabled").maybeSingle();
    const v = data && typeof (data as any).value === "string" ? String((data as any).value).trim().toLowerCase() : null;
    if (v === "false") globalAutoEnabled = false;
  } catch {
    // ignore (default: enabled)
  }

  // Optional auto-publish (governed by candidate-level toggle).
  // - If OFF, Centro Informativo can remain empty (editorial policy).
  // - If ON, we publish immediately and optionally forward a teaser to n8n.
  if (pol.auto_publish_enabled === true && globalAutoEnabled) {
    try {
      const created_at = new Date().toISOString();
      const titleLine = blogWithCredits.split("\n").find((l) => l.trim().length > 0) ?? `Centro informativo · ${pol.name}`;
      const safeTitle = sanitizeHeadline({
        titleLine,
        candidateName: pol.name,
        ballotNumber: pol.ballot_number ?? null,
        region: pol.region ?? null,
      });
      let publicMain = stripPublicMetaLines(blogWithCredits);
      // Guardrail (soft): if content seems too short, fall back to the full body (do not block publishing).
      if (wordCount(publicMain) < 120) {
        console.warn("[editorial-orchestrate] low_content_publish_fallback", { requestId, candidate_id: pol.id, wc: wordCount(publicMain) });
        publicMain = normalizeLineBreaks(blogWithCredits);
      }

      const excerpt = publicMain.split("\n").filter(Boolean).slice(0, 6).join("\n").slice(0, 420);
      const slug = slugify(`${pol.slug}-${created_at}-${titleLine}`);
      const mediaUrl =
        (metadata as any)?.media?.image_url && typeof (metadata as any).media.image_url === "string" ? String((metadata as any).media.image_url) : "";
      // Publish an image whenever possible. If we couldn't find a real image, the fallback SVG is still better than blank.
      const mediaOk = mediaUrl && !isBadOgImageUrl(mediaUrl) ? mediaUrl : fallbackPublicImageUrl(`${pol.id}|${created_at}|fallback`);

      const { data: post, error: postErr } = await admin
        .from("citizen_news_posts")
        .insert({
          candidate_id: pol.id,
          slug,
          title: safeTitle.slice(0, 160),
          subtitle,
          excerpt,
          body: blogWithCredits,
          media_urls: [mediaOk],
          source_url: typeof (metadata as any).source_url === "string" ? (metadata as any).source_url : null,
          status: "published",
          published_at: created_at,
          created_at,
        })
        .select("id")
        .maybeSingle();

      if (!postErr) {
        // Backlink draft -> post
        const nextMeta =
          metadata && typeof metadata === "object"
            ? { ...(metadata as Record<string, unknown>), published_post_id: post?.id ?? null, published_slug: slug, auto_published_at: created_at }
            : { published_post_id: post?.id ?? null, published_slug: slug, auto_published_at: created_at };
        await admin.from("ai_drafts").update({ metadata: nextMeta }).eq("id", inserted.id);

        // Forward teaser to n8n (best-effort; does NOT block).
        const publicLink = `${getSiteUrlString()}/centro-informativo#${slug}`;
        const teaser = `${titleLine}\n\nLee el análisis completo:\n${publicLink}`.slice(0, 800);
        let socialLinks: Array<{ platform: string; handle: string | null; url: string }> = [];
        try {
          const { data } = await admin
            .from("politician_social_links")
            .select("platform,handle,url,status")
            .eq("politician_id", pol.id)
            .eq("status", "active")
            .order("created_at", { ascending: true });
          socialLinks =
            (data ?? [])
              .filter((r: any) => typeof r?.platform === "string" && typeof r?.url === "string")
              .map((r: any) => ({ platform: String(r.platform), handle: typeof r.handle === "string" ? r.handle : null, url: String(r.url) }));
        } catch {
          // ignore (best-effort)
        }

        type NetworkKey = "facebook" | "instagram" | "threads" | "x" | "telegram" | "reddit";
        type DestinationScope = "page" | "profile" | "channel";

        function normalizeNetworkKeyFrom(name: unknown, url: unknown): NetworkKey | null {
          const hay = `${String(name ?? "")} ${String(url ?? "")}`.toLowerCase();
          if (hay.includes("facebook") || hay.includes("fb.com") || hay.includes("facebook.com")) return "facebook";
          if (hay.includes("instagram") || hay.includes("instagr.am") || hay.includes("instagram.com")) return "instagram";
          if (hay.includes("threads") || hay.includes("threads.net")) return "threads";
          if (hay.includes("twitter") || hay.includes("x.com") || hay.includes("t.co")) return "x";
          if (hay.includes("telegram") || hay.includes("t.me")) return "telegram";
          if (hay.includes("reddit") || hay.includes("reddit.com")) return "reddit";
          return null;
        }

        function normalizeScopeFrom(v: unknown, nk: NetworkKey | null): DestinationScope {
          const s = String(v ?? "").trim().toLowerCase();
          if (s === "page" || s === "profile" || s === "channel") return s;
          if (nk === "telegram") return "channel";
          if (nk === "facebook") return "page";
          return "profile";
        }

        function defaultCredentialRefFor(nk: NetworkKey | null): string {
          if (!nk) return "default";
          if (nk === "facebook" || nk === "instagram" || nk === "threads") return "meta_default";
          if (nk === "x") return "x_default";
          if (nk === "telegram") return "telegram_default";
          if (nk === "reddit") return "reddit_default";
          return "default";
        }

        let approvedDestinations: any[] = [];
        try {
          const { data } = await admin
            .from("politician_social_destinations")
            .select("id,network_name,network_key,scope,target_id,credential_ref,network_type,profile_or_page_url,active,authorization_status")
            .eq("politician_id", pol.id)
            .eq("active", true)
            .eq("authorization_status", "approved")
            .order("created_at", { ascending: false });
          approvedDestinations =
            (data ?? [])
              .filter((d: any) => d && typeof d.profile_or_page_url === "string")
              .map((d: any) => {
                const nk = (typeof d.network_key === "string" && d.network_key.trim() ? d.network_key.trim().toLowerCase() : "") as any;
                const network = (nk || normalizeNetworkKeyFrom(d.network_name, d.profile_or_page_url) || "facebook") as NetworkKey;
                const scope = normalizeScopeFrom(d.scope, network);
                const cred = typeof d.credential_ref === "string" && d.credential_ref.trim() ? d.credential_ref.trim() : defaultCredentialRefFor(network);
                const target_id = typeof d.target_id === "string" ? d.target_id.trim() : "";
                const base: any = {
                  network,
                  scope,
                  credential_ref: cred,
                  candidate_id: pol.id,
                  region: String(pol.office || "").toLowerCase().includes("senado") ? "colombia" : String(pol.region || "").toLowerCase().includes("meta") ? "meta" : "colombia",
                  destination_id: String(d.id),
                  network_name: String(d.network_name),
                  network_type: String(d.network_type),
                  profile_or_page_url: String(d.profile_or_page_url),
                };
                if (scope === "page") base.page_id = target_id || null;
                if (scope === "profile") base.account_id = target_id || null;
                if (scope === "channel") base.channel_id = target_id || null;
                // Legacy compatibility keys (some nodes still read name/url)
                base.name = String(d.network_name);
                base.url = String(d.profile_or_page_url);
                return base;
              });
        } catch {
          // ignore (best-effort)
        }
        void submitToN8n({
          candidate_id: pol.id,
          content_type: "social",
          generated_text: teaser,
          token_estimate: 0,
          created_at,
          source: "web",
          variants: {
            facebook: variantsJson.facebook,
            instagram: variantsJson.instagram,
            threads: variantsJson.threads,
            x: variantsJson.x,
            telegram: variantsJson.telegram,
            reddit: variantsJson.reddit,
          },
          metadata: {
            origin: "auto_publish_editorial_orchestrate",
            blog_slug: slug,
            source_url: (metadata as any).source_url ?? null,
            variants: variantsJson,
            media: (metadata as any).media ?? null,
            social_links: socialLinks,
            destinations: approvedDestinations,
            candidate: {
              id: pol.id,
              name: pol.name,
              office: pol.office,
              region: pol.region,
              ballot_number: pol.ballot_number ?? null,
            },
          },
          draft: {
            id: inserted.id,
            candidate_id: pol.id,
            generated_text: teaser,
            variants: {
              facebook: variantsJson.facebook,
              instagram: variantsJson.instagram,
              threads: variantsJson.threads,
              x: variantsJson.x,
              telegram: variantsJson.telegram,
              reddit: variantsJson.reddit,
            },
          },
        });
      } else {
        console.warn("[editorial-orchestrate] auto_publish_failed", { requestId, candidate_id: pol.id });
      }
    } catch {
      console.warn("[editorial-orchestrate] auto_publish_exception", { requestId, candidate_id: pol.id });
    }
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

