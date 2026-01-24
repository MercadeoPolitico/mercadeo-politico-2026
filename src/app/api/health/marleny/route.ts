import { NextResponse } from "next/server";

export const runtime = "nodejs";

function normalizeToken(v: unknown): string {
  const s = String(v ?? "").trim();
  if (!s) return "";
  if ((s.startsWith('"') && s.endsWith('"')) || (s.startsWith("'") && s.endsWith("'"))) return s.slice(1, -1).trim();
  return s.endsWith("\\n") ? s.slice(0, -2).trim() : s;
}

function normalizeSecret(raw: string | undefined): string {
  const s = String(raw ?? "").trim();
  if (!s) return "";
  return s.endsWith("\\n") ? s.slice(0, -2).trim() : s;
}

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
async function probeMarlenyAi(args: { endpoint: string; apiKey: string }): Promise<{ ok: boolean; status: number | null; failure: string | null }> {
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 6000);
    const resp = await fetch(args.endpoint, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${args.apiKey}` },
      body: JSON.stringify({
        system: "ping",
        user: "ping",
        constraints: { content_type: "chat", max_output_chars: 200 },
      }),
      cache: "no-store",
      signal: ctrl.signal,
    });
    clearTimeout(t);
    return { ok: resp.ok, status: resp.status, failure: resp.ok ? null : "http_error" };
  } catch (e: any) {
    const name = typeof e?.name === "string" ? e.name : "";
    if (name === "AbortError") return { ok: false, status: null, failure: "timeout" };
    return { ok: false, status: null, failure: "network_error" };
  }
}

export async function GET(req: Request) {
  const aiFlag = process.env.MARLENY_AI_ENABLED;
  const aiEnabled = aiFlag === "false" ? false : aiFlag === "true" ? true : true;
  const aiHasConfig = Boolean(
    (process.env.MARLENY_AI_ENDPOINT || process.env.MARLENY_ENDPOINT || process.env.MARLENY_API_URL) &&
      (process.env.MARLENY_AI_API_KEY || process.env.MARLENY_API_KEY || process.env.MARLENY_TOKEN),
  );

  const gatewayEnabled = process.env.MARLENY_ENABLED === "true";
  const gatewayHasConfig = Boolean(process.env.MARLENY_ENDPOINT && (process.env.MARLENY_TOKEN || process.env.MARLENY_API_KEY));

  const url = new URL(req.url);
  const wantProbe = url.searchParams.get("probe") === "true";
  const tokenHeader = normalizeToken(req.headers.get("x-automation-token") ?? "");
  const tokenEnv = normalizeToken(process.env.MP26_AUTOMATION_TOKEN ?? process.env.AUTOMATION_API_TOKEN);
  const allowProbe = wantProbe && tokenEnv && tokenHeader === tokenEnv;

  let probe: { ok: true; marleny_ai: any } | null = null;
  if (allowProbe) {
    const endpoint = String(process.env.MARLENY_AI_ENDPOINT ?? process.env.MARLENY_ENDPOINT ?? process.env.MARLENY_API_URL ?? "").trim();
    const apiKey = normalizeSecret(process.env.MARLENY_AI_API_KEY ?? process.env.MARLENY_API_KEY ?? process.env.MARLENY_TOKEN);
    if (endpoint && apiKey) {
      probe = {
        ok: true,
        marleny_ai: {
          host: hostOf(endpoint),
          ...(await probeMarlenyAi({ endpoint, apiKey })),
        },
      };
    } else {
      probe = { ok: true, marleny_ai: { ok: false, status: null, failure: "not_configured" } };
    }
  }

  return NextResponse.json({
    ok: true,
    marleny_ai: {
      enabled: aiEnabled,
      configured: aiEnabled && aiHasConfig,
      endpoint_host: hostOf(process.env.MARLENY_AI_ENDPOINT ?? process.env.MARLENY_ENDPOINT ?? process.env.MARLENY_API_URL),
    },
    marleny_gateway: {
      enabled: gatewayEnabled,
      configured: gatewayEnabled && gatewayHasConfig,
      endpoint_host: hostOf(process.env.MARLENY_ENDPOINT),
    },
    ...(probe ? { probe } : {}),
  });
}

