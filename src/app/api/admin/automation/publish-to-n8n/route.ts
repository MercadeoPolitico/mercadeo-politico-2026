import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth/admin";
import { readJsonBodyWithLimit } from "@/lib/automation/readBody";
import { getSiteUrlString } from "@/lib/site";

export const runtime = "nodejs";

function normalizeToken(v: unknown): string {
  const s = String(v ?? "").trim();
  if (!s) return "";
  if ((s.startsWith('"') && s.endsWith('"')) || (s.startsWith("'") && s.endsWith("'"))) return s.slice(1, -1).trim();
  return s.endsWith("\\n") ? s.slice(0, -2).trim() : s;
}

export async function POST(req: Request) {
  await requireAdmin();

  const apiToken = normalizeToken(process.env.MP26_AUTOMATION_TOKEN ?? process.env.AUTOMATION_API_TOKEN);
  if (!apiToken) return NextResponse.json({ ok: false, error: "not_configured" }, { status: 503 });

  const body = await readJsonBodyWithLimit(req);
  if (!body.ok) return NextResponse.json({ ok: false, error: body.error }, { status: 400 });

  const target = `${getSiteUrlString()}/api/automation/publish-to-n8n`;
  const resp = await fetch(target, {
    method: "POST",
    headers: { "content-type": "application/json", "x-automation-token": apiToken },
    body: JSON.stringify(body.data),
    cache: "no-store",
  });

  const txt = await resp.text();
  let json: any = null;
  try {
    json = JSON.parse(txt);
  } catch {
    // ignore
  }
  return NextResponse.json(json ?? { ok: false, error: "bad_response" }, { status: resp.status });
}

