type Block =
  | { type: "heading"; level: 1 | 2 | 3; text: string }
  | { type: "list"; items: string[] }
  | { type: "paragraph"; text: string };

const MAJOR_ICONS = ["🛡️", "⚖️", "🛣️", "🎖️", "🎓", "🌎", "🗺️"] as const;
const MINOR_ICONS = ["📌", "✅", "🎯", "✔", "🏗️", "👥", "🌿", "🌍", "📍", "🌾", "🌳", "🚜", "🌊"] as const;
const ALL_ICONS = [...MAJOR_ICONS, ...MINOR_ICONS] as const;

function normalizeIconSections(input: string): string {
  // Goal: if the user pasted everything in one line, inject section breaks at icons.
  let s = (input ?? "").replace(/\r\n/g, "\n");
  for (const icon of ALL_ICONS) {
    // Insert a blank line before icon when it's not already at a line start.
    // Example: "... texto ✅ Propuestas ..." -> "... texto\n\n✅ Propuestas ..."
    s = s.replaceAll(` ${icon}`, `\n\n${icon}`);
  }
  // For repeated checkmarks without a space before them.
  s = s.replaceAll("✔", "\n✔");
  // Collapse excessive blank lines.
  s = s.replace(/\n{3,}/g, "\n\n");
  return s;
}

function toBlocks(input: string): Block[] {
  const text = normalizeIconSections(input).trim();
  if (!text) return [];

  const lines = text.split("\n");
  const blocks: Block[] = [];
  let paraBuf: string[] = [];
  let listBuf: string[] = [];

  const flushPara = () => {
    const t = paraBuf.join(" ").replace(/\s+/g, " ").trim();
    paraBuf = [];
    if (t) blocks.push({ type: "paragraph", text: t });
  };
  const flushList = () => {
    const items = listBuf.map((s) => s.trim()).filter(Boolean);
    listBuf = [];
    if (items.length) blocks.push({ type: "list", items });
  };

  for (const raw of lines) {
    const line = raw.trim();
    if (!line) {
      flushList();
      flushPara();
      continue;
    }

    // Emoji-driven section headings (common in proposals pasted from WhatsApp/docs).
    const isMajor = MAJOR_ICONS.some((i) => line.startsWith(i));
    const isMinor = MINOR_ICONS.some((i) => line.startsWith(i));
    if (isMajor || isMinor) {
      flushList();
      flushPara();
      blocks.push({ type: "heading", level: isMajor ? 2 : 3, text: line });
      continue;
    }

    const m = /^(#{1,3})\s+(.*)$/.exec(line);
    if (m) {
      flushList();
      flushPara();
      const level = Math.min(3, Math.max(1, m[1]!.length)) as 1 | 2 | 3;
      blocks.push({ type: "heading", level, text: m[2]!.trim() });
      continue;
    }

    const isList = /^[-*]\s+/.test(line);
    if (isList) {
      flushPara();
      listBuf.push(line.replace(/^[-*]\s+/, ""));
      continue;
    }

    // If we were building a list and hit plain text, close list first.
    if (listBuf.length) flushList();
    paraBuf.push(line);
  }

  flushList();
  flushPara();

  return blocks;
}

export function AutoFormatText({ text }: { text: string }) {
  const blocks = toBlocks(text);
  if (blocks.length === 0) return null;

  return (
    <div className="autoformat space-y-4">
      {blocks.map((b, idx) => {
        if (b.type === "heading") {
          const cls =
            b.level === 1
              ? "text-base font-semibold text-foreground"
              : b.level === 2
                ? "text-sm font-semibold text-foreground"
                : "text-sm font-medium text-foreground";
          return (
            <h3 key={idx} className={cls}>
              {b.text}
            </h3>
          );
        }
        if (b.type === "list") {
          return (
            <ul key={idx} className="list-disc space-y-2 pl-5 text-sm text-muted">
              {b.items.map((it, i) => (
                <li key={i} className="leading-relaxed">
                  {it}
                </li>
              ))}
            </ul>
          );
        }
        return (
          <p key={idx} className="text-sm leading-relaxed text-muted">
            {b.text}
          </p>
        );
      })}
    </div>
  );
}

