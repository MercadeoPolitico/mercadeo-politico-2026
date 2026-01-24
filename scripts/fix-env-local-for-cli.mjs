/**
 * Fix .env.local so CLIs can parse it (safe).
 *
 * - Creates a backup: .env.local.bak (once)
 * - Rewrites multiline quoted values into single-line values with \n escapes
 * - Comments out stray/invalid lines that would break dotenv parsers
 *
 * IMPORTANT:
 * - Does NOT print any secret values
 * - Only prints counts
 */
import fs from "node:fs";

const ENV_PATH = ".env.local";
const BAK_PATH = ".env.local.bak";

function isVarLine(line) {
  return /^[A-Za-z_][A-Za-z0-9_]*=/.test(line);
}

function stripLeadingBom(s) {
  return s.charCodeAt(0) === 0xfeff ? s.slice(1) : s;
}

function endsWithUnescapedQuote(s) {
  // Rough but good enough for dotenv: last quote not preceded by backslash.
  return s.endsWith('"') && !s.endsWith('\\"');
}

function main() {
  if (!fs.existsSync(ENV_PATH)) {
    console.error("[envfix] missing .env.local");
    process.exit(1);
  }

  if (!fs.existsSync(BAK_PATH)) {
    fs.copyFileSync(ENV_PATH, BAK_PATH);
  }

  const raw = stripLeadingBom(fs.readFileSync(ENV_PATH, "utf8"));
  const lines = raw.split(/\r?\n/);

  const out = [];
  let inMultiline = false;
  let currentKey = "";
  let currentValue = "";
  let commented = 0;
  let merged = 0;

  const flush = () => {
    if (!inMultiline) return;
    // currentValue includes starting quote
    let v = currentValue;
    if (!endsWithUnescapedQuote(v)) v += '"';
    // Turn real newlines into \n for dotenv
    const inner = v.startsWith('"') ? v.slice(1, -1) : v;
    const escaped = inner.replaceAll("\\", "\\\\").replaceAll("\r", "").replaceAll("\n", "\\n").replaceAll('"', '\\"');
    out.push(`${currentKey}="${escaped}"`);
    inMultiline = false;
    currentKey = "";
    currentValue = "";
    merged++;
  };

  for (let idx = 0; idx < lines.length; idx++) {
    const lineRaw = lines[idx] ?? "";
    const line = lineRaw;

    if (!inMultiline) {
      if (!line.trim() || line.trim().startsWith("#")) {
        out.push(line);
        continue;
      }
      if (isVarLine(line)) {
        const eq = line.indexOf("=");
        const key = line.slice(0, eq).trim();
        const value = line.slice(eq + 1);

        if (value.trim().startsWith('"') && !endsWithUnescapedQuote(value.trim())) {
          inMultiline = true;
          currentKey = key;
          currentValue = value.trim(); // starts with "
          continue;
        }

        out.push(line);
        continue;
      }

      out.push(`# [cursor envfix] ${line}`);
      commented++;
      continue;
    }

    // multiline continuation
    const next = lineRaw;
    currentValue += `\n${next}`;
    if (endsWithUnescapedQuote(next.trim())) {
      flush();
    }
  }

  flush();
  fs.writeFileSync(ENV_PATH, out.join("\n"), "utf8");

  console.log("[envfix] ok", { merged_multiline: merged, commented_lines: commented, backup: fs.existsSync(BAK_PATH) });
}

main();

