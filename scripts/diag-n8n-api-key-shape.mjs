/**
 * Safe: inspects N8N_API_KEY formatting in .env.local without printing the value.
 */
import fs from "node:fs";

function parseDotenv(raw) {
  const env = {};
  for (const line of raw.split(/\r?\n/)) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const i = t.indexOf("=");
    if (i < 1) continue;
    const k = t.slice(0, i).trim();
    let v = t.slice(i + 1).trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
    if (v.endsWith("\\n")) v = v.slice(0, -2);
    env[k] = v;
  }
  return env;
}

const raw = fs.readFileSync(".env.local", "utf8");
const env = parseDotenv(raw);
const v = String(env.N8N_API_KEY ?? "");

console.log(
  JSON.stringify(
    {
      ok: true,
      has_key: Boolean(v.trim()),
      shape: {
        has_whitespace: /\s/.test(v),
        has_hash: v.includes("#"),
        has_quotes_inside: v.includes('"') || v.includes("'"),
      },
    },
    null,
    2,
  ),
);

