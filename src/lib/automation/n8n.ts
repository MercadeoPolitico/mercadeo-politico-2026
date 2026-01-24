import "server-only";
import type { SubmitToN8nRequest } from "./types";

export type N8nSubmitResult = { ok: true } | { ok: false; error: "disabled" | "not_configured" | "upstream_error" };

function normalizeWebhookUrl(raw: string | null | undefined): string | null {
  const s = String(raw ?? "").trim().replace(/\/+$/, "");
  if (!s) return null;
  // Backward-compatible: allow setting only the n8n base URL.
  // If the configured URL doesn't include a webhook path, assume the main publish webhook path.
  if (!s.includes("/webhook/") && !s.includes("/webhook-test/")) return `${s}/webhook/mp26-editorial-orchestrator`;
  return s;
}

function isEnabled(): boolean {
  // Continuity-first:
  // - If N8N_FORWARD_ENABLED="false" => disabled.
  // - If N8N_FORWARD_ENABLED="true"  => enabled.
  // - If unset, enable only when config is present (common setup).
  const flag = process.env.N8N_FORWARD_ENABLED;
  if (flag === "false") return false;
  if (flag === "true") return true;
  return hasConfig();
}

function hasConfig(): boolean {
  const url = normalizeWebhookUrl(process.env.N8N_WEBHOOK_URL ?? process.env.WEBHOOK_URL);
  const token =
    process.env.N8N_WEBHOOK_TOKEN ??
    process.env.WEBHOOK_TOKEN ??
    // Continuity-first fallback: reuse existing automation token if a dedicated webhook token is not set.
    process.env.MP26_AUTOMATION_TOKEN ??
    process.env.AUTOMATION_API_TOKEN;
  return Boolean(url && url.trim().length && token && token.trim().length);
}

export async function submitToN8n(payload: SubmitToN8nRequest): Promise<N8nSubmitResult> {
  if (!isEnabled()) return { ok: false, error: "disabled" };
  if (!hasConfig()) return { ok: false, error: "not_configured" };

  try {
    const url = normalizeWebhookUrl(process.env.N8N_WEBHOOK_URL ?? process.env.WEBHOOK_URL)!;
    const token =
      (process.env.N8N_WEBHOOK_TOKEN ??
        process.env.WEBHOOK_TOKEN ??
        process.env.MP26_AUTOMATION_TOKEN ??
        process.env.AUTOMATION_API_TOKEN)!
        .trim();
    const resp = await fetch(url, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-n8n-webhook-token": token,
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

