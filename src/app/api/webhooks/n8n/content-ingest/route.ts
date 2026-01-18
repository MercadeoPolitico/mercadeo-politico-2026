import { NextResponse } from "next/server";

export const runtime = "nodejs";

/**
 * n8n webhook: content ingestion (disabled by default).
 *
 * Security model:
 * - Requires N8N_WEBHOOK_TOKEN to be set (otherwise 404)
 * - Requires header x-n8n-webhook-token to match (otherwise 401)
 *
 * Behavior:
 * - Accepts JSON payload
 * - No writes yet (foundation only)
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
    receivedAt: new Date().toISOString(),
    // echo nothing sensitive; just acknowledge.
    summary: { keys: Object.keys(payload ?? {}) },
  });
}

