import "server-only";

export type Trend = "subiendo" | "estable" | "bajando";
export type TimeBlock = "mañana" | "tarde" | "noche";

export type CitizenPanelData = {
  reachedTrend: Trend;
  municipalities: string[];
  affinityLabels: string[];
  bestTimeBlock: TimeBlock;
};

function classifyTimeBlockBogota(iso: string): TimeBlock {
  const parts = new Intl.DateTimeFormat("es-CO", {
    timeZone: "America/Bogota",
    hour: "2-digit",
    hour12: false,
  }).formatToParts(new Date(iso));

  const hPart = parts.find((p) => p.type === "hour")?.value ?? "12";
  const hour = Number(hPart);

  // 06–11 mañana, 12–17 tarde, 18–23/00–05 noche
  if (hour >= 6 && hour <= 11) return "mañana";
  if (hour >= 12 && hour <= 17) return "tarde";
  return "noche";
}

function trendFromWindows(curr: number, prev: number): Trend {
  if (curr === 0 && prev === 0) return "estable";
  if (prev === 0 && curr > 0) return "subiendo";

  const diff = curr - prev;
  const rel = diff / Math.max(prev, 1);

  // Conservative thresholds; no numbers exposed to politician.
  if (rel > 0.2 && diff >= 2) return "subiendo";
  if (rel < -0.2 && diff <= -2) return "bajando";
  return "estable";
}

function normalizeMunicipality(m: string): string {
  const v = m.trim().replaceAll(/\s+/g, " ");
  // Title-case (simple, locale-friendly)
  return v
    .split(" ")
    .map((w) => (w.length ? w[0]!.toUpperCase() + w.slice(1).toLowerCase() : w))
    .join(" ");
}

const THEMES: { label: string; keywords: string[] }[] = [
  { label: "Seguridad y convivencia", keywords: ["seguridad", "convivencia", "orden", "ley", "autoridad", "delito"] },
  { label: "Familia y valores", keywords: ["familia", "valores", "vida", "cristian", "relig"] },
  { label: "Desarrollo regional", keywords: ["desarrollo", "región", "regional", "territorio", "meta", "llanos", "campo", "campes"] },
  { label: "Propuestas sociales", keywords: ["salud", "educación", "empleo", "social", "bienestar", "oportunidades"] },
  { label: "Mensajes institucionales", keywords: ["institución", "institucional", "estado", "democracia", "constitución", "legal"] },
];

export function classifyAffinityLabel(text: string): string {
  const t = text.toLowerCase();
  let best: { label: string; score: number } | null = null;

  for (const theme of THEMES) {
    const score = theme.keywords.reduce((acc, k) => (t.includes(k) ? acc + 1 : acc), 0);
    if (!best || score > best.score) best = { label: theme.label, score };
  }

  // Fallback
  if (!best || best.score === 0) return "Mensajes institucionales";
  return best.label;
}

export function computeCitizenPanelData(input: {
  events: { event_type: string; municipality: string | null; content_id: string | null; occurred_at: string }[];
  publicationTextsById: Record<string, string>;
}): CitizenPanelData {
  // Only approved lifecycle events contribute
  const contributing = input.events.filter((e) => e.event_type === "approval_approved" || e.event_type === "automation_submitted");

  // Trend: last 7 days vs previous 7 days (based on occurred_at)
  const nowMs = Date.now();
  const dayMs = 24 * 60 * 60 * 1000;
  const startCurr = nowMs - 7 * dayMs;
  const startPrev = nowMs - 14 * dayMs;

  const currCount = contributing.filter((e) => Date.parse(e.occurred_at) >= startCurr).length;
  const prevCount = contributing.filter((e) => {
    const ts = Date.parse(e.occurred_at);
    return ts >= startPrev && ts < startCurr;
  }).length;

  const reachedTrend = trendFromWindows(currCount, prevCount);

  // Municipalities (top 3–5)
  const muniCounts = new Map<string, number>();
  for (const e of contributing) {
    if (!e.municipality) continue;
    const key = normalizeMunicipality(e.municipality);
    muniCounts.set(key, (muniCounts.get(key) ?? 0) + 1);
  }
  const municipalities = Array.from(muniCounts.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([name]) => name);

  // Affinity labels (from publication texts)
  const labelCounts = new Map<string, number>();
  for (const e of contributing) {
    const id = e.content_id ?? "";
    const text = id ? input.publicationTextsById[id] : "";
    if (!text) continue;
    const label = classifyAffinityLabel(text);
    labelCounts.set(label, (labelCounts.get(label) ?? 0) + 1);
  }
  const affinityLabels = Array.from(labelCounts.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([label]) => label);

  if (affinityLabels.length === 0) {
    affinityLabels.push("Mensajes institucionales");
  }

  // Best time blocks
  const blockCounts = new Map<TimeBlock, number>([
    ["mañana", 0],
    ["tarde", 0],
    ["noche", 0],
  ]);
  for (const e of contributing) {
    const b = classifyTimeBlockBogota(e.occurred_at);
    blockCounts.set(b, (blockCounts.get(b) ?? 0) + 1);
  }
  const bestTimeBlock = (Array.from(blockCounts.entries()).sort((a, b) => b[1] - a[1])[0]?.[0] ?? "tarde") as TimeBlock;

  return { reachedTrend, municipalities, affinityLabels, bestTimeBlock };
}

