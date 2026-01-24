/**
 * Ensure N8N_WEBHOOK_URL points to the correct webhook path.
 *
 * - Reads .env.local
 * - If N8N_WEBHOOK_URL exists and does NOT contain /webhook/, appends `/webhook/mp26-editorial-orchestrator`
 * - Never prints secret values
 */
import fs from "node:fs";

const ENV_PATH = ".env.local";

function parseDotenvLines(raw) {
  const lines = raw.split(/\r?\n/);
  const entries = [];
  for (const line of lines) {
    const t = line.trim();
    if (!t || t.startsWith("#") || !/^[A-Za-z_][A-Za-z0-9_]*\s*=/.test(t)) {
      entries.push({ kind: "raw", line });
      continue;
    }
    const i = line.indexOf("=");
    const key = line.slice(0, i).trim();
    const rest = line.slice(i + 1);
    entries.push({ kind: "kv", key, rawValue: rest });
  }
  return entries;
}

function decodeValue(rawValue) {
  let v = String(rawValue ?? "").trim();
  if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
  if (v.endsWith("\\n")) v = v.slice(0, -2);
  return v;
}

function encodeValue(v) {
  // preserve simple dotenv quoting
  const s = String(v ?? "");
  const escaped = s.replaceAll("\\", "\\\\").replaceAll('"', '\\"');
  return `"${escaped}"`;
}

function normalizeWebhookUrl(u) {
  const s0 = String(u || "").trim();
  if (!s0) return "";
  const s = s0.replace(/\/+$/, "");
  if (!s) return "";
  if (s.includes("/webhook/") || s.includes("/webhook-test/")) return s;
  try {
    const url = new URL(s);
    const path = (url.pathname || "/").replace(/\/+$/, "") || "/";
    // Only auto-append when the input is effectively just an origin/base URL.
    if (path === "/") return `${url.origin}/webhook/mp26-editorial-orchestrator`;
    return s;
  } catch {
    return s;
  }
}

function main() {
  if (!fs.existsSync(ENV_PATH)) {
    console.log("[n8n-url] missing .env.local");
    process.exit(0);
  }
  const raw = fs.readFileSync(ENV_PATH, "utf8");
  const entries = parseDotenvLines(raw);

  let changed = false;
  let hadKey = false;

  const out = entries.map((e) => {
    if (e.kind !== "kv") return e.line;
    if (e.key !== "N8N_WEBHOOK_URL") return `${e.key}=${e.rawValue}`.replace(/\r?\n/g, "");
    hadKey = true;
    const current = decodeValue(e.rawValue);
    const next = normalizeWebhookUrl(current);
    if (next && next !== current) changed = true;
    return `${e.key}=${encodeValue(next || current)}`;
  });

  if (changed) fs.writeFileSync(ENV_PATH, out.join("\n"), "utf8");
  console.log("[n8n-url] ok", { hadKey, changed });
}

main();

