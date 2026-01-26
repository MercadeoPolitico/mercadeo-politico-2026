import "server-only";

type WikimediaImage = {
  image_url: string;
  page_url: string;
  thumb_url: string | null;
  license_short: string | null;
  attribution: string | null;
  author: string | null;
  mime: string | null;
  source: "wikimedia_commons";
};

function isNonEmptyString(v: unknown): v is string {
  return typeof v === "string" && v.trim().length > 0;
}

function safeText(v: unknown): string | null {
  if (!isNonEmptyString(v)) return null;
  return v.trim();
}

function normalizeQuery(q: string): string {
  return q
    .replaceAll(/\s+/g, " ")
    .trim()
    .slice(0, 180);
}

function isAllowedLicenseShort(s: string | null): boolean {
  if (!s) return false;
  const t = s.toLowerCase();
  return (
    t.includes("cc by") ||
    t.includes("cc-by") ||
    t.includes("cc by-sa") ||
    t.includes("cc-by-sa") ||
    t.includes("creative commons attribution") ||
    t.includes("attribution-sharealike") ||
    t.includes("public domain") ||
    t.includes("pd-") ||
    t.includes("cc0")
  );
}

function isLikelyDocumentImageTitleOrUrl(input: string): boolean {
  const s = String(input || "").toLowerCase();
  if (!s) return false;
  // Common "document scan" patterns from Wikimedia uploads (PDF renders, manuals, bulletins, decrees, etc).
  const bad = [
    ".pdf",
    "pdf.jpg",
    "pdf.png",
    "/page1-",
    "/page2-",
    "/page3-",
    "boletin",
    "boletín",
    "gaceta",
    "diario oficial",
    "resolucion",
    "resolución",
    "decreto",
    "acta",
    "oficio",
    "manual",
    "juridic",
    "jurídic",
    "sentencia",
    "ley_",
    "ley-",
    "documento",
    "carta",
    "circular",
    "formulario",
  ];
  return bad.some((b) => s.includes(b));
}

function isPhotoMime(mime: string | null): boolean {
  const m = String(mime || "").toLowerCase();
  return m === "image/jpeg" || m === "image/jpg" || m === "image/png" || m === "image/webp" || m === "image/avif";
}

function scoreCandidate(c: WikimediaImage, query: string): number {
  const title = `${c.page_url} ${c.image_url}`.toLowerCase();
  const q = String(query || "").toLowerCase();

  let score = 0;
  // Prefer real photos over icons/vectors.
  if (isPhotoMime(c.mime)) score += 6;
  if (String(c.mime || "").toLowerCase() === "image/svg+xml") score -= 2;

  // Avoid coats of arms and flags when we can.
  if (title.includes("escudo")) score -= 3;
  if (title.includes("bandera")) score -= 2;
  if (title.includes("logo")) score -= 3;

  // Prefer things that match query tokens (helps keep relevance).
  const tokens = q
    .split(/[\s,;|]+/g)
    .map((t) => t.trim())
    .filter((t) => t.length >= 4)
    .slice(0, 10);
  for (const tok of tokens) {
    if (title.includes(tok)) score += 1;
  }

  // Slightly prefer higher-res original URLs (Commons URLs often embed width in thumb URLs).
  if (c.thumb_url && /\/\d+px-/.test(c.thumb_url)) score += 1;

  return score;
}

function pickFromCandidates(cands: WikimediaImage[], avoidUrls: Set<string>, query: string): WikimediaImage | null {
  const filtered = cands.filter((c) => !avoidUrls.has(c.image_url));
  const pool = filtered.length ? filtered : cands;
  if (!pool.length) return null;

  const scored = pool
    .map((c) => ({ c, s: scoreCandidate(c, query) }))
    .sort((a, b) => b.s - a.s);

  // Take a top slice to keep variety without selecting low-quality items.
  const top = scored.slice(0, Math.min(6, scored.length)).map((x) => x.c);
  return top[Math.floor(Math.random() * top.length)] ?? null;
}

export async function pickWikimediaImage(args: {
  query: string;
  avoid_urls?: string[];
}): Promise<WikimediaImage | null> {
  const q = normalizeQuery(args.query);
  if (!q) return null;

  const avoid = new Set((args.avoid_urls ?? []).filter(isNonEmptyString).map((u) => u.trim()));

  // Commons API (no key). We intentionally keep it conservative.
  // Docs: https://www.mediawiki.org/wiki/API:Search
  const url = new URL("https://commons.wikimedia.org/w/api.php");
  url.searchParams.set("action", "query");
  url.searchParams.set("format", "json");
  url.searchParams.set("origin", "*");
  url.searchParams.set("generator", "search");
  url.searchParams.set("gsrsearch", q);
  url.searchParams.set("gsrlimit", "18");
  url.searchParams.set("gsrnamespace", "6"); // File:
  url.searchParams.set("prop", "imageinfo");
  url.searchParams.set("iiprop", "url|mime|extmetadata");
  url.searchParams.set("iiurlwidth", "1400");

  const resp = await fetch(url.toString(), {
    method: "GET",
    cache: "no-store",
    headers: { "user-agent": "mercadeo-politico-2026/1.0 (news automation)" },
  }).catch(() => null);

  if (!resp?.ok) return null;
  const json = (await resp.json().catch(() => null)) as any;
  const pages = json?.query?.pages;
  if (!pages || typeof pages !== "object") return null;

  const candidates: WikimediaImage[] = [];

  for (const k of Object.keys(pages)) {
    const p = pages[k];
    const title = safeText(p?.title);
    const infos = Array.isArray(p?.imageinfo) ? p.imageinfo : [];
    const info = infos[0];
    const image_url = safeText(info?.url);
    const thumb_url = safeText(info?.thumburl);
    const mime = safeText(info?.mime);
    if (!title || !image_url) continue;
    // Must be an actual image; Commons search can return PDFs/djvu.
    if (!mime || !mime.toLowerCase().startsWith("image/")) continue;
    if (isLikelyDocumentImageTitleOrUrl(`${title} ${image_url}`)) continue;

    const page_url = `https://commons.wikimedia.org/wiki/${encodeURIComponent(title.replaceAll(" ", "_"))}`;

    const meta = info?.extmetadata ?? {};
    const license_short = safeText(meta?.LicenseShortName?.value);
    if (!isAllowedLicenseShort(license_short)) continue;

    const author = safeText(meta?.Artist?.value)?.replaceAll(/<[^>]*>/g, "").trim() ?? null;
    const attribution =
      safeText(meta?.Attribution?.value)?.replaceAll(/<[^>]*>/g, "").trim() ??
      safeText(meta?.Credit?.value)?.replaceAll(/<[^>]*>/g, "").trim() ??
      null;

    candidates.push({
      image_url,
      page_url,
      thumb_url,
      license_short,
      attribution,
      author,
      mime,
      source: "wikimedia_commons",
    });
  }

  return pickFromCandidates(candidates, avoid, q);
}

