import "server-only";

type WikimediaImage = {
  image_url: string;
  page_url: string;
  thumb_url: string | null;
  license_short: string | null;
  attribution: string | null;
  author: string | null;
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
    t.includes("public domain") ||
    t.includes("pd-") ||
    t.includes("cc0")
  );
}

function pickFromCandidates(cands: WikimediaImage[], avoidUrls: Set<string>): WikimediaImage | null {
  const filtered = cands.filter((c) => !avoidUrls.has(c.image_url));
  const pool = filtered.length ? filtered : cands;
  if (!pool.length) return null;
  return pool[Math.floor(Math.random() * pool.length)] ?? null;
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
  url.searchParams.set("iiprop", "url|extmetadata");
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
    if (!title || !image_url) continue;

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
      source: "wikimedia_commons",
    });
  }

  return pickFromCandidates(candidates, avoid);
}

