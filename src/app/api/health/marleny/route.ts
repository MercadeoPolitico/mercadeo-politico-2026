import { NextResponse } from "next/server";

export const runtime = "nodejs";

function hostOf(url: string | undefined): string | null {
  if (!url) return null;
  try {
    return new URL(url).host;
  } catch {
    return null;
  }
}

/**
 * Diagnostics endpoint (no secrets).
 * Returns only booleans + endpoint hostnames.
 */
export async function GET() {
  const aiEnabled = process.env.MARLENY_AI_ENABLED === "true";
  const aiHasConfig = Boolean(process.env.MARLENY_AI_ENDPOINT && process.env.MARLENY_AI_API_KEY);

  const gatewayEnabled = process.env.MARLENY_ENABLED === "true";
  const gatewayHasConfig = Boolean(process.env.MARLENY_ENDPOINT && process.env.MARLENY_TOKEN);

  return NextResponse.json({
    ok: true,
    marleny_ai: {
      enabled: aiEnabled,
      configured: aiEnabled && aiHasConfig,
      endpoint_host: hostOf(process.env.MARLENY_AI_ENDPOINT),
    },
    marleny_gateway: {
      enabled: gatewayEnabled,
      configured: gatewayEnabled && gatewayHasConfig,
      endpoint_host: hostOf(process.env.MARLENY_ENDPOINT),
    },
  });
}

