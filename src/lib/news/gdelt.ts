import "server-only";

export type GdeltArticle = {
  title: string;
  url: string;
  seendate: string;
  sourceCountry?: string;
};

export async function fetchTopGdeltArticle(query: string): Promise<GdeltArticle | null> {
  const q = encodeURIComponent(query);
  const url = `https://api.gdeltproject.org/api/v2/doc/doc?query=${q}&mode=ArtList&format=json&maxrecords=1&sort=HybridRel`;

  try {
    const resp = await fetch(url, { cache: "no-store" });
    if (!resp.ok) return null;
    const data = (await resp.json()) as unknown;
    if (!data || typeof data !== "object") return null;
    const obj = data as Record<string, unknown>;
    const articles = Array.isArray(obj.articles) ? (obj.articles as unknown[]) : [];
    const first = articles[0];
    if (!first || typeof first !== "object") return null;
    const a = first as Record<string, unknown>;
    const title = typeof a.title === "string" ? a.title.trim() : "";
    const link = typeof a.url === "string" ? a.url.trim() : "";
    const seendate = typeof a.seendate === "string" ? a.seendate.trim() : "";
    const sourceCountry = typeof a.sourceCountry === "string" ? a.sourceCountry.trim() : undefined;
    if (!title || !link) return null;
    return { title, url: link, seendate, ...(sourceCountry ? { sourceCountry } : {}) };
  } catch {
    return null;
  }
}

