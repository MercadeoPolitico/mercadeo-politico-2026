import { NextResponse } from "next/server";

export const runtime = "nodejs";

/**
 * n8n webhook: request Marleny analysis/generation (disabled by default).
 *
 * This endpoint is a lightweight adapter. n8n can call this,
 * and this endpoint can forward to `/api/si/marleny` (gateway token required there).
 *
 * For now, we only acknowledge receipt (foundation phase).
 */
export async function POST(req: Request) {
  const token = process.env.N8N_WEBHOOK_TOKEN;
  const headerToken = req.headers.get("x-n8n-webhook-token") ?? "";

  if (!token) return NextResponse.json({ error: "not_found" }, { status: 404 });
  if (headerToken !== token) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const payload = await req.json();

  return NextResponse.json({
    ok: true,
    accepted: true,
    next: "Configure n8n to call /api/si/marleny with x-marleny-gateway-token (server-only).",
    summary: { keys: Object.keys(payload ?? {}) },
  });
}

