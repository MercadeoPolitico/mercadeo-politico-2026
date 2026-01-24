import { NextResponse } from "next/server";

export const runtime = "nodejs";

function normalizeToken(v: unknown): string {
  const s = String(v ?? "").trim();
  if (!s) return "";
  if ((s.startsWith('"') && s.endsWith('"')) || (s.startsWith("'") && s.endsWith("'"))) return s.slice(1, -1).trim();
  return s;
}

export async function GET() {
  const mp26 = normalizeToken(process.env.MP26_AUTOMATION_TOKEN);
  const legacy = normalizeToken(process.env.AUTOMATION_API_TOKEN);
  const active = mp26 || legacy;

  return NextResponse.json({
    ok: true,
    automation: {
      configured: Boolean(active),
      mode: mp26 ? "mp26" : legacy ? "legacy" : "none",
      // safe diagnostics (no secrets)
      token_len: active ? active.length : 0,
      has_quotes_or_ws: Boolean(
        (process.env.MP26_AUTOMATION_TOKEN && process.env.MP26_AUTOMATION_TOKEN !== mp26) ||
          (process.env.AUTOMATION_API_TOKEN && process.env.AUTOMATION_API_TOKEN !== legacy),
      ),
    },
  });
}

