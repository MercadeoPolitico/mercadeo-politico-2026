import "server-only";

export type GdeltArticle = {
  title: string;
  url: string;
  seendate: string;
  sourceCountry?: string;
};

export type GdeltPickOptions = {
  /**
   * Optional list of URL substring hints (e.g., domains or brand strings)
   * to prefer local/regional outlets when available.
   *
   * Not a hard constraint: if no match, we fall back to best overall.
   */
  preferred_url_hints?: string[];
  /**
   * If true, prefer sensational/high-impact civic news (still Colombia-biased).
   * This is a soft preference only.
   */
  prefer_sensational?: boolean;
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

function normalizeHints(hints: string[] | undefined): string[] {
  if (!Array.isArray(hints)) return [];
  return Array.from(
    new Set(
      hints
        .map((h) => String(h || "").trim().toLowerCase())
        .filter(Boolean)
        .slice(0, 20),
    ),
  );
}

function matchesAnyHint(url: string, hints: string[]): boolean {
  if (!hints.length) return false;
  const u = String(url || "").toLowerCase();
  return hints.some((h) => u.includes(h));
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

function safeHostOf(u: string): string {
  try {
    return new URL(u).host.toLowerCase();
  } catch {
    return "";
  }
}

function seendateScore(seendate: string): number {
  // Higher is better (more recent). We keep it coarse to avoid timezone issues.
  const t = Date.parse(seendate);
  if (!Number.isFinite(t)) return 0;
  const hoursAgo = (Date.now() - t) / 3_600_000;
  if (hoursAgo <= 6) return 12;
  if (hoursAgo <= 12) return 9;
  if (hoursAgo <= 24) return 6;
  if (hoursAgo <= 48) return 3;
  return 1;
}

function sensationalScore(title: string): number {
  const t = String(title || "").toLowerCase();
  if (!t) return 0;
  // Spanish + Colombia-relevant sensational / high-impact terms.
  const hits = [
    "secuestro",
    "extors",
    "homicid",
    "asesin",
    "sicari",
    "masacre",
    "atent",
    "explosi",
    "captur",
    "allan",
    "incaut",
    "narcot",
    "corrup",
    "soborno",
    "fraude",
    "abuso",
    "violenc",
    "rob",
    "atraco",
    "accidente",
    "choque",
    "incendio",
    "protest",
    "bloqueo",
    "paro",
    "denuncia",
    "amenaza",
  ].filter((k) => t.includes(k)).length;
  return Math.min(10, hits * 2);
}

function scoreArticle(a: GdeltArticle, args: { qRaw: string; preferredHints: string[]; preferSensational: boolean }): number {
  let score = 0;
  score += seendateScore(a.seendate);

  // Prefer local outlets when query implies Colombia.
  if (shouldBiasToColombia(args.qRaw) && isLikelyColombianSource(a)) score += 10;

  // Prefer configured regional providers.
  if (args.preferredHints.length && matchesAnyHint(a.url, args.preferredHints)) score += 12;

  // Penalize obviously irrelevant international domains when Colombia is intended.
  if (shouldBiasToColombia(args.qRaw)) {
    const host = safeHostOf(a.url);
    const badHosts = ["thehindu.com", "carbuzz.com"];
    if (badHosts.some((h) => host.endsWith(h))) score -= 25;
  }

  if (args.preferSensational) score += sensationalScore(a.title);

  return score;
}

export async function fetchTopGdeltArticle(query: string, opts?: GdeltPickOptions): Promise<GdeltArticle | null> {
  const raw = query.trim();
  if (!raw) return null;
  const preferredHints = normalizeHints(opts?.preferred_url_hints);
  const preferSensational = opts?.prefer_sensational === true;

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

      const biasCo = shouldBiasToColombia(qRaw);
      const blockedHosts = new Set(["thehindu.com", "carbuzz.com"]);
      const isBlocked = (u: string) => {
        const h = safeHostOf(u);
        if (!h) return false;
        for (const b of blockedHosts) if (h === b || h.endsWith(`.${b}`)) return true;
        return false;
      };

      // If Colombia bias is on and we have any Colombian-looking sources, prefer them.
      const colombian = biasCo ? mapped.filter((a) => isLikelyColombianSource(a)) : [];

      // If we have any preferred regional sources, prefer them strongly.
      const hinted = preferredHints.length ? mapped.filter((a) => matchesAnyHint(a.url, preferredHints)) : [];

      // If we have some non-blocked options, avoid obviously irrelevant outlets.
      const nonBlocked = mapped.filter((a) => !isBlocked(a.url));

      const pool = hinted.length ? hinted : colombian.length ? colombian : nonBlocked.length ? nonBlocked : mapped;

      // Score and pick best candidate (soft preferences).
      const scored = pool
        .map((a) => ({ a, s: scoreArticle(a, { qRaw, preferredHints, preferSensational }) }))
        .sort((x, y) => y.s - x.s);
      return scored[0]?.a ?? null;
    }
    return null;
  } catch {
    return null;
  }
}

