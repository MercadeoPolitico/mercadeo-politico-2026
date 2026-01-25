import "server-only";

/**
 * Region-aware provider preferences.
 *
 * IMPORTANT:
 * - These are NOT hard constraints.
 * - They are signals to help select *more local* sources when available.
 * - Easy to extend: add region keys and outlets/hints below.
 */

export type RegionKey = "meta" | "bogota" | "colombia" | "default";

export type RegionalProviders = {
  /** Normalized region key used for selection + metadata. */
  region_used: RegionKey;
  /** Human-facing provider names for internal traceability (metadata only). */
  preferred_sources: string[];
  /** URL substring hints to bias selection (no scraping). */
  url_hints: string[];
};

type ProviderEntry = { label: string; urlHints: string[] };

function norm(s: string): string {
  return String(s || "").trim().toLowerCase();
}

function dedupe(xs: string[]): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const x of xs) {
    const t = String(x || "").trim();
    if (!t) continue;
    const key = t.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(t);
  }
  return out;
}

function entry(label: string, urlHints: string[] = []): ProviderEntry {
  return { label, urlHints: urlHints.map((h) => String(h || "").trim()).filter(Boolean) };
}

/**
 * Extendable provider map.
 * - Keys are normalized region keys (see normalizeRegionKey()).
 * - Values include names + URL hints (substrings).
 */
const newsProvidersByRegion: Record<RegionKey, ProviderEntry[]> = {
  meta: [
    entry("James Informa", ["jamesinforma"]),
    entry("Periódico del Meta", ["periodico", "meta"]),
    entry("Llano 7 Días", ["llano", "7dias", "7-dias", "llano7"]),
    entry("Llano al Mundo", ["llanoalmundo.com", "llanoalmundo"]),
    entry("Gobernación del Meta (Noticias)", ["meta.gov.co/noticias", "meta.gov.co"]),
    entry("El Tiempo (Meta)", ["eltiempo.com/noticias/meta"]),
    entry("Medios regionales verificados del Meta", ["villavicencio", "meta", "granada", "acacias", "vistahermosa", "puerto gaitan", "puerto lópez"]),
  ],
  bogota: [
    entry("El Espectador", ["elespectador.com"]),
    entry("El Tiempo (Bogotá)", ["eltiempo.com"]),
    entry("Semana", ["semana.com"]),
    entry("CityTV Noticias", ["citytv", "canalcitytv"]),
  ],
  colombia: [
    entry("El Tiempo", ["eltiempo.com"]),
    entry("La República", ["larepublica.co"]),
    entry("El Espectador", ["elespectador.com"]),
    entry("Semana", ["semana.com"]),
    entry("El Colombiano", ["elcolombiano.com"]),
    entry("Noticias Caracol", ["noticiascaracol.com"]),
    entry("RCN Noticias", ["noticiasrcn.com", "rcnradio.com"]),
  ],
  default: [entry("El Tiempo", ["eltiempo.com"]), entry("La República", ["larepublica.co"]), entry("El Espectador", ["elespectador.com"])],
};

export function normalizeRegionKey(region: string, office: string): RegionKey {
  const off = norm(office);
  if (off.includes("senado")) return "colombia";

  const r = norm(region);
  if (!r) return "default";
  if (r.includes("bogot")) return "bogota";
  if (r === "meta" || r.includes("departamento del meta") || r.includes("meta (")) return "meta";
  if (r.includes("colombia") || r.includes("nacional")) return "colombia";
  return "default";
}

export function regionalProvidersForCandidate(args: { office: string; region: string }): RegionalProviders {
  const region_used = normalizeRegionKey(args.region, args.office);
  const entries = newsProvidersByRegion[region_used] ?? newsProvidersByRegion.default;
  const preferred_sources = dedupe(entries.map((e) => e.label));
  const url_hints = dedupe(entries.flatMap((e) => e.urlHints));
  return { region_used, preferred_sources, url_hints };
}

