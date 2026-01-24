import "server-only";

export type GdeltArticle = {
  title: string;
  url: string;
  seendate: string;
  sourceCountry?: string;
};

function hasOp(q: string, op: string): boolean {
  return new RegExp(`\\b${op}:`, "i").test(q);
}

function shouldBiasToColombia(q: string): boolean {
  const s = q.toLowerCase();
  return s.includes("colombia") || s.includes("meta") || s.includes("villavicencio") || s.includes("departamento del meta");
}

function isLikelyColombianSource(a: { url?: string; sourceCountry?: string }): boolean {
  const u = String(a.url ?? "").toLowerCase();
  const sc = String(a.sourceCountry ?? "").trim().toUpperCase();
  // Strong hints: Colombian domains or Colombian source country codes.
  const domainHint = u.includes(".co/") || u.includes(".com.co/") || u.endsWith(".co");
  const countryHint = sc === "CO" || sc === "COL" || sc === "COLOMBIA" || sc.startsWith("CO");
  return domainHint || countryHint;
}

function withDefaultFilters(rawQuery: string): string {
  const base = rawQuery.trim();
  if (!base) return base;

  // Prefer Spanish sources for Colombia civic news (can be overridden by explicit ops).
  const parts: string[] = [base];
  if (!hasOp(base, "sourcelang")) parts.push("sourcelang:spanish");

  // For Colombia/Meta queries, avoid irrelevant global outlets by default.
  // GDELT uses FIPS country codes; Colombia = CO.
  if (shouldBiasToColombia(base) && !hasOp(base, "sourcecountry")) parts.push("sourcecountry:co");

  return parts.join(" ");
}

export async function fetchTopGdeltArticle(query: string): Promise<GdeltArticle | null> {
  const raw = query.trim();
  if (!raw) return null;

  // Two-pass strategy:
  // 1) Try with default filters (Spanish + Colombia bias for local queries)
  // 2) If empty, retry raw query (allows international fallback when needed)
  const candidates = [withDefaultFilters(raw), raw].filter((x, idx, arr) => x && arr.indexOf(x) === idx);

  try {
    for (const qRaw of candidates) {
      // eslint-disable-next-line no-await-in-loop
      const q = encodeURIComponent(qRaw);
      // Pull a small set and pick the best match for Colombia when needed.
      const url = `https://api.gdeltproject.org/api/v2/doc/doc?query=${q}&mode=ArtList&format=json&maxrecords=25&sort=HybridRel`;
      // eslint-disable-next-line no-await-in-loop
      const resp = await fetch(url, { cache: "no-store" });
      if (!resp.ok) continue;
      // eslint-disable-next-line no-await-in-loop
      const data = (await resp.json()) as unknown;
      if (!data || typeof data !== "object") continue;
      const obj = data as Record<string, unknown>;
      const articles = Array.isArray(obj.articles) ? (obj.articles as unknown[]) : [];
      const mapped = articles
        .filter((x) => x && typeof x === "object")
        .map((x) => {
          const a = x as Record<string, unknown>;
          const title = typeof a.title === "string" ? a.title.trim() : "";
          const link = typeof a.url === "string" ? a.url.trim() : "";
          const seendate = typeof a.seendate === "string" ? a.seendate.trim() : "";
          const sourceCountry = typeof a.sourceCountry === "string" ? a.sourceCountry.trim() : undefined;
          return { title, url: link, seendate, sourceCountry };
        })
        .filter((a) => a.title && a.url);

      if (mapped.length === 0) continue;

      if (shouldBiasToColombia(qRaw)) {
        const preferred = mapped.find((a) => isLikelyColombianSource(a));
        if (preferred) return preferred;
      }

      return mapped[0] ?? null;
    }
    return null;
  } catch {
    return null;
  }
}

