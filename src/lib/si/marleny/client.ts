import "server-only";
import type { MarlenyRequest, MarlenyResponse } from "./types";

export type MarlenyResult =
  | { ok: true; data: MarlenyResponse }
  | { ok: false; error: "disabled" | "not_configured" | "upstream_error" };

function isEnabled(): boolean {
  return process.env.MARLENY_ENABLED === "true";
}

function hasConfig(): boolean {
  return Boolean(process.env.MARLENY_ENDPOINT && process.env.MARLENY_TOKEN);
}

/**
 * Server-side integration boundary for Marleny (black-box).
 * - Disabled by default
 * - No secrets logged
 * - No browser exposure (server-only)
 */
export async function callMarleny(req: MarlenyRequest): Promise<MarlenyResult> {
  if (!isEnabled()) return { ok: false, error: "disabled" };
  if (!hasConfig()) return { ok: false, error: "not_configured" };

  try {
    const resp = await fetch(process.env.MARLENY_ENDPOINT!, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${process.env.MARLENY_TOKEN!}`,
      },
      body: JSON.stringify(req),
      // Marleny is a decision-support component; avoid caching by default.
      cache: "no-store",
    });

    if (!resp.ok) return { ok: false, error: "upstream_error" };

    const data = (await resp.json()) as MarlenyResponse;
    return { ok: true, data };
  } catch {
    return { ok: false, error: "upstream_error" };
  }
}

export function isMarlenyConfigured(): boolean {
  return isEnabled() && hasConfig();
}

