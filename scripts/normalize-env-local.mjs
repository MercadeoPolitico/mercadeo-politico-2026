/**
 * Normalize .env.local safely (no secret logs):
 * - De-duplicates keys (keeps last non-empty)
 * - Trims surrounding quotes and strips trailing literal "\n"
 * - Optionally renames common *_TOKEN_CLI -> *_TOKEN (keeps value)
 *
 * Output: prints only a summary (counts), never values.
 */
import fs from "node:fs";

const ENV_PATH = ".env.local";

const RENAME_MAP = new Map([
  ["RAILWAY_TOKEN_CLI", "RAILWAY_TOKEN"],
  ["VERCEL_TOKEN_CLI", "VERCEL_TOKEN"],
]);

function decodeValue(raw) {
  let v = String(raw ?? "").trim();
  if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
  if (v.endsWith("\\n")) v = v.slice(0, -2);
  return v;
}

function encodeValue(v) {
  const s = String(v ?? "");
  const escaped = s.replaceAll("\\", "\\\\").replaceAll('"', '\\"');
  return `"${escaped}"`;
}

function parse(raw) {
  const entries = [];
  for (const line of raw.split(/\r?\n/)) {
    const t = line.trim();
    if (!t || t.startsWith("#") || !/^[A-Za-z_][A-Za-z0-9_]*\s*=/.test(t)) {
      entries.push({ kind: "raw", line });
      continue;
    }
    const i = line.indexOf("=");
    const key = line.slice(0, i).trim();
    const rawValue = line.slice(i + 1);
    entries.push({ kind: "kv", key, rawValue });
  }
  return entries;
}

function main() {
  if (!fs.existsSync(ENV_PATH)) {
    console.log(JSON.stringify({ ok: false, error: "missing_.env.local" }, null, 2));
    process.exit(1);
  }
  const raw = fs.readFileSync(ENV_PATH, "utf8");
  const entries = parse(raw);

  // Keep the last non-empty value for each key
  const last = new Map(); // key -> { value, idx }
  const counts = new Map(); // key -> occurrences

  entries.forEach((e, idx) => {
    if (e.kind !== "kv") return;
    const k0 = e.key;
    const k = RENAME_MAP.get(k0) ?? k0;
    counts.set(k0, (counts.get(k0) ?? 0) + 1);
    const v = decodeValue(e.rawValue);
    if (v.trim().length) last.set(k, { value: v, idx });
  });

  const normalizedLines = [];
  // Preserve comment/header raw lines at the top (best-effort)
  for (const e of entries) {
    if (e.kind === "raw") normalizedLines.push(e.line);
    else break;
  }

  // Emit normalized keys sorted for stability
  const keys = Array.from(last.keys()).sort((a, b) => a.localeCompare(b));
  for (const k of keys) {
    normalizedLines.push(`${k}=${encodeValue(last.get(k).value)}`);
  }

  fs.writeFileSync(ENV_PATH, normalizedLines.join("\n").replace(/\n{3,}/g, "\n\n") + "\n", "utf8");

  const duplicates = Array.from(counts.entries()).filter(([, n]) => n > 1).map(([k, n]) => ({ key: k, count: n }));
  console.log(JSON.stringify({ ok: true, wrote: true, keys: keys.length, duplicates: duplicates.length }, null, 2));
}

main();

