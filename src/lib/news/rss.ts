import "server-only";

export type RssSource = {
  id: string;
  name: string;
  region_key: "meta" | "colombia";
  base_url: string;
  rss_url: string;
  active: boolean;
};

export type RssItem = {
  title: string;
  url: string;
  published_at: string | null;
  source_name: string;
  source_region: "meta" | "colombia";
  // Reference-only media (do not redistribute publicly)
  rss_image_urls: string[];
};

function stripCdata(s: string): string {
  return s.replaceAll(/^<!\[CDATA\[/, "").replaceAll(/\]\]>$/, "");
}

function decodeXmlEntities(s: string): string {
  // Minimal entities; keep it lightweight.
  return s
    .replaceAll("&amp;", "&")
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
    .replaceAll("&quot;", '"')
    .replaceAll("&apos;", "'");
}

function textBetween(xml: string, tag: string): string[] {
  const re = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, "gi");
  const out: string[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(xml))) out.push(m[1] ?? "");
  return out;
}

function attrValues(xml: string, tag: string, attr: string): string[] {
  const re = new RegExp(`<${tag}[^>]*\\b${attr}=["']([^"']+)["'][^>]*\\/?>`, "gi");
  const out: string[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(xml))) out.push(m[1] ?? "");
  return out;
}

function safeUrl(raw: string, base: string): string | null {
  const v = String(raw || "").trim();
  if (!v) return null;
  try {
    const u = new URL(v, base);
    if (u.protocol !== "http:" && u.protocol !== "https:") return null;
    return u.toString();
  } catch {
    return null;
  }
}

function normalizeTitle(s: string): string {
  const t = decodeXmlEntities(stripCdata(String(s || "").trim()))
    .replaceAll(/<[^>]*>/g, " ")
    .replaceAll(/\s+/g, " ")
    .trim();
  return t.slice(0, 220);
}

function normalizeDate(s: string): string | null {
  const t = Date.parse(String(s || "").trim());
  if (!Number.isFinite(t)) return null;
  return new Date(t).toISOString();
}

function scoreRecency(publishedAt: string | null): number {
  if (!publishedAt) return 0;
  const t = Date.parse(publishedAt);
  if (!Number.isFinite(t)) return 0;
  const hoursAgo = (Date.now() - t) / 3_600_000;
  if (hoursAgo <= 6) return 12;
  if (hoursAgo <= 12) return 9;
  if (hoursAgo <= 24) return 6;
  if (hoursAgo <= 48) return 3;
  return 1;
}

function scoreSensational(title: string): number {
  const t = title.toLowerCase();
  const hits = [
    "secuestro",
    "extors",
    "homicid",
    "asesin",
    "sicari",
    "masacre",
    "atent",
    "captur",
    "allan",
    "incaut",
    "narcot",
    "corrup",
    "fraude",
    "abuso",
    "violenc",
    "rob",
    "atraco",
    "accidente",
    "incendio",
    "bloqueo",
    "paro",
    "denuncia",
    "amenaza",
  ].filter((k) => t.includes(k)).length;
  return Math.min(10, hits * 2);
}

function scoreQueryMatch(title: string, queryTerms: string[]): number {
  const t = title.toLowerCase();
  let hits = 0;
  for (const q of queryTerms) {
    const w = q.toLowerCase();
    if (w.length >= 4 && t.includes(w)) hits++;
  }
  return Math.min(10, hits * 2);
}

function pickTop(items: RssItem[], queryTerms: string[]): RssItem | null {
  if (!items.length) return null;
  // Hard preference buckets:
  // 1) "grave" civic-risk topics (seguridad/violencia/accidentes)
  // 2) "viral" / agenda ligera (solo si no hay grave)
  // 3) fallback: cualquier cosa relevante y reciente
  const t = (s: string) => s.toLowerCase();
  const isGrave = (title: string) =>
    [
      "secuestro",
      "extors",
      "homicid",
      "asesin",
      "sicari",
      "masacre",
      "atent",
      "captur",
      "allan",
      "incaut",
      "narcot",
      "corrup",
      "fraude",
      "abuso",
      "violenc",
      "rob",
      "atraco",
      "accidente",
      "choque",
      "muert",
      "herid",
      "incendio",
      "explos",
      "amenaza",
    ].some((k) => t(title).includes(k));
  const isViral = (title: string) =>
    ["viral", "tendencia", "faránd", "farand", "concierto", "música", "musica", "fútbol", "futbol", "festival", "show", "entreten"].some((k) =>
      t(title).includes(k),
    );

  const score = (it: RssItem) => scoreRecency(it.published_at) + scoreSensational(it.title) * 2 + scoreQueryMatch(it.title, queryTerms);
  const sortByScore = (arr: RssItem[]) => arr.map((it) => ({ it, s: score(it) })).sort((a, b) => b.s - a.s)[0]?.it ?? null;

  const grave = items.filter((it) => isGrave(it.title));
  if (grave.length) return sortByScore(grave) ?? sortByScore(items);

  const viral = items.filter((it) => isViral(it.title));
  if (viral.length) return sortByScore(viral) ?? sortByScore(items);

  return sortByScore(items);
}

function parseRss2(xml: string, source: RssSource): RssItem[] {
  const items = textBetween(xml, "item");
  const out: RssItem[] = [];
  for (const itXml of items) {
    const title = normalizeTitle(textBetween(itXml, "title")[0] ?? "");
    const linkRaw = (textBetween(itXml, "link")[0] ?? "").trim();
    const url = safeUrl(stripCdata(linkRaw), source.base_url);
    if (!title || !url) continue;
    const pub = normalizeDate(textBetween(itXml, "pubDate")[0] ?? "") ?? normalizeDate(textBetween(itXml, "dc:date")[0] ?? "");

    const imgs = [
      ...attrValues(itXml, "media:content", "url"),
      ...attrValues(itXml, "media:thumbnail", "url"),
      ...attrValues(itXml, "enclosure", "url"),
    ]
      .map((u) => safeUrl(u, source.base_url))
      .filter((u): u is string => Boolean(u));

    out.push({
      title,
      url,
      published_at: pub,
      source_name: source.name,
      source_region: source.region_key,
      rss_image_urls: Array.from(new Set(imgs)).slice(0, 6),
    });
  }
  return out;
}

function parseAtom(xml: string, source: RssSource): RssItem[] {
  const entries = textBetween(xml, "entry");
  const out: RssItem[] = [];
  for (const eXml of entries) {
    const title = normalizeTitle(textBetween(eXml, "title")[0] ?? "");
    const linkHref = attrValues(eXml, "link", "href")[0] ?? "";
    const url = safeUrl(linkHref, source.base_url);
    if (!title || !url) continue;
    const pub =
      normalizeDate(textBetween(eXml, "updated")[0] ?? "") ?? normalizeDate(textBetween(eXml, "published")[0] ?? "");

    // Atom may include <link rel="enclosure" href="...">
    const imgs = attrValues(eXml, "link", "href")
      .map((u) => safeUrl(u, source.base_url))
      .filter((u): u is string => Boolean(u));

    out.push({
      title,
      url,
      published_at: pub,
      source_name: source.name,
      source_region: source.region_key,
      rss_image_urls: Array.from(new Set(imgs)).slice(0, 6),
    });
  }
  return out;
}

export async function fetchRssItems(args: { source: RssSource; limit?: number }): Promise<RssItem[]> {
  const limit = typeof args.limit === "number" ? args.limit : 10;
  const source = args.source;
  try {
    const controller = new AbortController();
    const t = setTimeout(() => controller.abort(), 6500);
    const resp = await fetch(source.rss_url, { method: "GET", cache: "no-store", signal: controller.signal });
    clearTimeout(t);
    if (!resp.ok) return [];
    const xml = (await resp.text()).slice(0, 500_000);
    const lower = xml.toLowerCase();
    const parsed = lower.includes("<feed") && lower.includes("http://www.w3.org/2005/atom") ? parseAtom(xml, source) : parseRss2(xml, source);
    return parsed.slice(0, Math.max(1, limit));
  } catch {
    return [];
  }
}

export async function pickTopRssItem(args: {
  sources: RssSource[];
  query_terms: string[];
  avoid_urls?: string[];
}): Promise<RssItem | null> {
  const active = args.sources.filter((s) => s.active);
  const all: RssItem[] = [];
  // Fetch in parallel to avoid N * timeout latency.
  const pickedSources = active.slice(0, 8);
  const results = await Promise.allSettled(pickedSources.map((s) => fetchRssItems({ source: s, limit: 12 })));
  for (const r of results) {
    if (r.status === "fulfilled" && Array.isArray(r.value)) all.push(...r.value);
  }
  // Deduplicate by URL
  const seen = new Set<string>();
  const deduped = all.filter((x) => {
    if (seen.has(x.url)) return false;
    seen.add(x.url);
    return true;
  });
  const avoid = new Set((args.avoid_urls ?? []).map((u) => String(u || "").trim().toLowerCase()).filter(Boolean));
  const filtered = avoid.size ? deduped.filter((x) => !avoid.has(String(x.url || "").trim().toLowerCase())) : deduped;
  return pickTop(filtered.length ? filtered : deduped, args.query_terms);
}

