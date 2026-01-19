import { NextResponse } from "next/server";
import { readJsonBodyWithLimit } from "@/lib/automation/readBody";
import { validateSubmitToN8nRequest } from "@/lib/automation/validate";
import { submitToN8n } from "@/lib/automation/n8n";

export const runtime = "nodejs";

/**
 * Controlled n8n forwarding endpoint (Paso H.3)
 *
 * - No AI calls here
 * - No publishing
 * - Explicitly invoked (never automatic)
 * - Disabled by default unless AUTOMATION_API_TOKEN is configured
 * - Forwarding itself is disabled by default unless N8N_FORWARD_ENABLED="true"
 */
export async function POST(req: Request) {
  const apiToken = process.env.AUTOMATION_API_TOKEN;
  const headerToken = req.headers.get("x-automation-token") ?? "";

  if (!apiToken) return NextResponse.json({ error: "not_found" }, { status: 404 });
  if (headerToken !== apiToken) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const body = await readJsonBodyWithLimit(req);
  if (!body.ok) return NextResponse.json({ error: body.error }, { status: 400 });

  const parsed = validateSubmitToN8nRequest(body.data);
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 });

  const result = await submitToN8n(parsed.data);
  if (!result.ok) {
    const status = result.error === "disabled" || result.error === "not_configured" ? 503 : 502;
    return NextResponse.json({ ok: false, error: result.error }, { status });
  }

  return NextResponse.json({ ok: true });
}

