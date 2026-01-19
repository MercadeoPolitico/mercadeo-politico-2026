import { NextResponse } from "next/server";
import { readJsonBodyWithLimit } from "@/lib/automation/readBody";
import { estimateTokens, maxOutputCharsFor } from "@/lib/automation/limits";
import { validateGenerateRequest } from "@/lib/automation/validate";
import { callMarlenyAI } from "@/lib/si/marleny-ai/client";
import type { GenerateResponse } from "@/lib/automation/types";

export const runtime = "nodejs";

/**
 * Controlled AI generation endpoint (Paso H.1)
 *
 * - Server-side only
 * - Exactly ONE AI call per request
 * - No retries, no streaming
 * - Never stores, never publishes, never forwards automatically
 * - Disabled-by-default unless AUTOMATION_API_TOKEN is set and matches header
 */
export async function POST(req: Request) {
  const apiToken = process.env.AUTOMATION_API_TOKEN;
  const headerToken = req.headers.get("x-automation-token") ?? "";

  // Off-by-default: if token not configured, behave as not found.
  if (!apiToken) return NextResponse.json({ error: "not_found" }, { status: 404 });
  if (headerToken !== apiToken) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const body = await readJsonBodyWithLimit(req);
  if (!body.ok) return NextResponse.json({ error: body.error }, { status: 400 });

  const parsed = validateGenerateRequest(body.data);
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 });

  const { candidate_id, content_type, topic, tone } = parsed.data;

  // Hard cap at output level too (cost + determinism)
  const maxOut = maxOutputCharsFor(content_type);

  const result = await callMarlenyAI({
    candidateId: candidate_id,
    contentType: content_type,
    topic,
    tone,
  });

  if (!result.ok) {
    const status = result.error === "disabled" || result.error === "not_configured" ? 503 : 502;
    return NextResponse.json({ error: result.error }, { status });
  }

  const text = result.text.slice(0, maxOut);
  const response: GenerateResponse = {
    generated_text: text,
    content_type,
    candidate_id,
    token_estimate: estimateTokens(text),
    created_at: new Date().toISOString(),
  };

  return NextResponse.json(response);
}

