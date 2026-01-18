import { NextResponse } from "next/server";
import { callMarleny } from "@/lib/si/marleny";

export const runtime = "nodejs";

/**
 * Marleny server-side gateway (disabled by default).
 *
 * Enabled only if:
 * - MARLENY_ENABLED="true"
 * - MARLENY_ENDPOINT + MARLENY_TOKEN are configured
 * - Request includes x-marleny-gateway-token matching MARLENY_GATEWAY_TOKEN
 *
 * This endpoint is intended for automation systems (e.g., n8n),
 * not for browser clients.
 */
export async function POST(req: Request) {
  const gatewayToken = process.env.MARLENY_GATEWAY_TOKEN;
  const headerToken = req.headers.get("x-marleny-gateway-token") ?? "";

  // Disabled-by-default: if no token configured, behave as not found.
  if (!gatewayToken) return NextResponse.json({ error: "not_found" }, { status: 404 });
  if (headerToken !== gatewayToken) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const payload = (await req.json()) as Parameters<typeof callMarleny>[0];
  const result = await callMarleny(payload);

  if (!result.ok) {
    const status = result.error === "disabled" || result.error === "not_configured" ? 503 : 502;
    return NextResponse.json({ ok: false, error: result.error }, { status });
  }

  return NextResponse.json({ ok: true, data: result.data });
}

