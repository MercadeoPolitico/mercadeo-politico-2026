import "server-only";
import type { SubmitToN8nRequest } from "./types";

export type N8nSubmitResult = { ok: true } | { ok: false; error: "disabled" | "not_configured" | "upstream_error" };

function isEnabled(): boolean {
  return process.env.N8N_FORWARD_ENABLED === "true";
}

function hasConfig(): boolean {
  return Boolean(process.env.N8N_WEBHOOK_URL && process.env.N8N_WEBHOOK_TOKEN);
}

export async function submitToN8n(payload: SubmitToN8nRequest): Promise<N8nSubmitResult> {
  if (!isEnabled()) return { ok: false, error: "disabled" };
  if (!hasConfig()) return { ok: false, error: "not_configured" };

  try {
    const resp = await fetch(process.env.N8N_WEBHOOK_URL!, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-n8n-webhook-token": process.env.N8N_WEBHOOK_TOKEN!,
      },
      body: JSON.stringify(payload),
      cache: "no-store",
    });

    if (!resp.ok) return { ok: false, error: "upstream_error" };
    return { ok: true };
  } catch {
    return { ok: false, error: "upstream_error" };
  }
}

