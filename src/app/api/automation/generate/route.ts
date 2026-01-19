import { NextResponse } from "next/server";
import { readJsonBodyWithLimit } from "@/lib/automation/readBody";
import { estimateTokens, maxOutputCharsFor } from "@/lib/automation/limits";
import { validateGenerateRequest } from "@/lib/automation/validate";
import { callMarlenyAI } from "@/lib/si/marleny-ai/client";
import type { GenerateResponse } from "@/lib/automation/types";
import { isAdminSession } from "@/lib/auth/adminSession";

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

  // Access control:
  // - If admin session is present: allow (internal UI; no secrets exposed to browser)
  // - Else: require AUTOMATION_API_TOKEN (off-by-default for public)
  const adminOk = await isAdminSession();
  if (!adminOk) {
    if (!apiToken) return NextResponse.json({ error: "not_found" }, { status: 404 });
    if (headerToken !== apiToken) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

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
  const createdAt = new Date().toISOString();

  // Phase 2.2: for social content, Marleny returns JSON with base + variants + image_keywords.
  let response: GenerateResponse;
  if (content_type === "social") {
    let base = text;
    let variants: GenerateResponse["variants"] | undefined;
    let image_keywords: string[] | undefined;

    try {
      const parsed = JSON.parse(text) as unknown;
      if (parsed && typeof parsed === "object") {
        const obj = parsed as Record<string, unknown>;
        const baseCandidate = typeof obj.base === "string" ? obj.base.trim() : "";
        const v = typeof obj.variants === "object" && obj.variants !== null ? (obj.variants as Record<string, unknown>) : null;
        const fb = v && typeof v.facebook === "string" ? v.facebook.trim() : "";
        const ig = v && typeof v.instagram === "string" ? v.instagram.trim() : "";
        const x = v && typeof v.x === "string" ? v.x.trim() : "";
        const kws = Array.isArray(obj.image_keywords)
          ? (obj.image_keywords.filter((k) => typeof k === "string").map((k) => k.trim()).filter(Boolean) as string[])
          : [];

        if (baseCandidate) base = baseCandidate.slice(0, 700);
        if (fb && ig && x) {
          variants = {
            facebook: fb.slice(0, 900),
            instagram: ig.slice(0, 900),
            x: x.slice(0, 280),
          };
        }
        if (kws.length) image_keywords = kws.slice(0, 12);
      }
    } catch {
      // fallback to plain text
    }

    response = {
      generated_text: base.slice(0, maxOut),
      content_type,
      candidate_id,
      token_estimate: estimateTokens(base),
      created_at: createdAt,
      ...(variants ? { variants } : {}),
      ...(image_keywords ? { image_keywords } : {}),
    };
  } else {
    response = {
      generated_text: text,
      content_type,
      candidate_id,
      token_estimate: estimateTokens(text),
      created_at: createdAt,
    };
  }

  return NextResponse.json(response);
}

