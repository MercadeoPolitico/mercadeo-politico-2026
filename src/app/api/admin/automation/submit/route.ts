import { NextResponse } from "next/server";
import { isAdminSession } from "@/lib/auth/adminSession";
import { readJsonBodyWithLimit } from "@/lib/automation/readBody";

export const runtime = "nodejs";

function normalizeToken(v: unknown): string {
  const s = String(v ?? "").trim();
  if (!s) return "";
  if ((s.startsWith('"') && s.endsWith('"')) || (s.startsWith("'") && s.endsWith("'"))) return s.slice(1, -1).trim();
  return s.endsWith("\\n") ? s.slice(0, -2).trim() : s;
}

export async function POST(req: Request) {
  // Admin-only wrapper: prevents browser from calling /api/automation/* directly.
  if (!(await isAdminSession())) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const token = normalizeToken(process.env.MP26_AUTOMATION_TOKEN ?? process.env.AUTOMATION_API_TOKEN);
  if (!token) return NextResponse.json({ error: "not_configured" }, { status: 503 });

  const body = await readJsonBodyWithLimit(req);
  if (!body.ok) return NextResponse.json({ error: body.error }, { status: 400 });

  const url = new URL(req.url);
  const target = new URL("/api/automation/submit", url.origin);

  const upstream = await fetch(target, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-automation-token": token,
    },
    body: JSON.stringify(body.data),
    cache: "no-store",
  });

  const json = await upstream.json().catch(() => null);
  return NextResponse.json(json ?? { ok: false, error: "bad_response" }, { status: upstream.status });
}

