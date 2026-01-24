import { NextResponse } from "next/server";
import { readJsonBodyWithLimit } from "@/lib/automation/readBody";
import { validateSubmitToN8nRequest } from "@/lib/automation/validate";
import { submitToN8n } from "@/lib/automation/n8n";
import { isAdminSession } from "@/lib/auth/adminSession";

export const runtime = "nodejs";

function isBrowserOrigin(req: Request): boolean {
  return Boolean(
    req.headers.get("sec-fetch-site") ||
      req.headers.get("sec-fetch-mode") ||
      req.headers.get("sec-fetch-dest") ||
      req.headers.get("origin") ||
      req.headers.get("referer"),
  );
}

function normalizeToken(v: unknown): string {
  const s = String(v ?? "").trim();
  if (!s) return "";
  if ((s.startsWith('"') && s.endsWith('"')) || (s.startsWith("'") && s.endsWith("'"))) return s.slice(1, -1).trim();
  return s.endsWith("\\n") ? s.slice(0, -2).trim() : s;
}

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
  // Automation endpoints are server-to-server only.
  // Admin UIs must use /api/admin/automation/* wrappers.
  if (isBrowserOrigin(req)) {
    console.warn("[automation/submit] rejected_browser_origin", {
      path: "/api/automation/submit",
      hasOrigin: Boolean(req.headers.get("origin")),
      hasReferer: Boolean(req.headers.get("referer")),
      hasSecFetch: Boolean(req.headers.get("sec-fetch-site") || req.headers.get("sec-fetch-mode") || req.headers.get("sec-fetch-dest")),
    });
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const apiToken = normalizeToken(process.env.MP26_AUTOMATION_TOKEN ?? process.env.AUTOMATION_API_TOKEN);
  const headerToken = normalizeToken(req.headers.get("x-automation-token") ?? "");
  if (!apiToken) return NextResponse.json({ error: "not_configured" }, { status: 503 });
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

