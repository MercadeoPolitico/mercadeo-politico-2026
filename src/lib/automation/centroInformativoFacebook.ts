import "server-only";
import { getSiteUrlString } from "@/lib/site";

const CENTRO_INFORMATIVO_PATH = "/centro-informativo";

export type CentroInformativoPost = {
  id: string;
  slug: string;
  title: string;
  excerpt: string;
  media_urls: string[] | null;
};

export type SubmitCentroFacebookResult =
  | { ok: true; facebook_post_id: string }
  | { ok: false; error: string; skip_reason?: "not_configured" };

function getWebhookUrl(): string | null {
  const raw = (process.env.N8N_WEBHOOK_URL_CENTRO_FACEBOOK ?? "").trim();
  if (!raw) return null;
  const url = raw.startsWith("http") ? raw : `https://${raw}`;
  try {
    new URL(url);
    return url;
  } catch {
    return null;
  }
}

function getToken(): string | null {
  const t =
    process.env.N8N_WEBHOOK_TOKEN ??
    process.env.WEBHOOK_TOKEN ??
    process.env.MP26_AUTOMATION_TOKEN ??
    process.env.AUTOMATION_API_TOKEN;
  const s = typeof t === "string" ? t.trim() : "";
  return s || null;
}

/**
 * Submit a published Centro Informativo post to n8n so it can publish to the single
 * Facebook Page "Centro Informativo Ciudadano". Link always points to the site's Centro Informativo.
 * n8n must respond with { ok: true, facebook_post_id } so we can persist it.
 */
export async function submitCentroInformativoToFacebook(
  post: CentroInformativoPost,
): Promise<SubmitCentroFacebookResult> {
  const url = getWebhookUrl();
  const token = getToken();
  if (!url) {
    console.info("[centro-informativo-facebook] skip: N8N_WEBHOOK_URL_CENTRO_FACEBOOK not set");
    return { ok: false, error: "not_configured", skip_reason: "not_configured" };
  }
  if (!token) {
    console.warn("[centro-informativo-facebook] skip: missing webhook token (N8N_WEBHOOK_TOKEN or MP26_AUTOMATION_TOKEN)");
    return { ok: false, error: "missing_webhook_token", skip_reason: "not_configured" };
  }

  const baseUrl = getSiteUrlString();
  const link = `${baseUrl}${CENTRO_INFORMATIVO_PATH}#${encodeURIComponent(post.slug)}`;
  const media_url = Array.isArray(post.media_urls) && post.media_urls.length > 0 ? post.media_urls[0] : null;

  const payload = {
    post_id: post.id,
    slug: post.slug,
    title: (post.title ?? "").slice(0, 300),
    excerpt: (post.excerpt ?? "").slice(0, 500),
    media_url,
    link,
  };

  try {
    const resp = await fetch(url, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-n8n-webhook-token": token,
      },
      body: JSON.stringify(payload),
      cache: "no-store",
    });

    const text = await resp.text().catch(() => "");
    let json: Record<string, unknown> = {};
    try {
      if (text) json = JSON.parse(text) as Record<string, unknown>;
    } catch {
      // ignore
    }

    if (!resp.ok) {
      const errMsg = typeof json?.error === "string" ? json.error : `http_${resp.status}`;
      console.warn("[centro-informativo-facebook] n8n error", { post_id: post.id, error: errMsg, status: resp.status });
      return { ok: false, error: errMsg };
    }

    const fbId = typeof json?.facebook_post_id === "string" ? json.facebook_post_id.trim() : null;
    if (json?.ok === true && fbId) {
      return { ok: true, facebook_post_id: fbId };
    }
    if (json?.ok === false && typeof json?.error === "string") {
      const err = json.error as string;
      if (err.includes("page_id") || err === "missing_page_id") console.warn("[centro-informativo-facebook] n8n: missing Page ID (set FACEBOOK_CENTRO_PAGE_ID in n8n)");
      else if (err.includes("token") || err === "missing_page_token") console.warn("[centro-informativo-facebook] n8n: missing Page Access Token (set FACEBOOK_CENTRO_PAGE_TOKEN in n8n)");
      else if (err.includes("facebook") || err.includes("reject")) console.warn("[centro-informativo-facebook] n8n: Facebook rejected", { post_id: post.id, error: err });
      else console.warn("[centro-informativo-facebook] n8n response", { post_id: post.id, error: err });
      return { ok: false, error: err };
    }
    console.warn("[centro-informativo-facebook] n8n response missing facebook_post_id", { post_id: post.id });
    return { ok: false, error: "no_facebook_post_id_in_response" };
  } catch (e) {
    const msg = e instanceof Error ? e.message : "network_error";
    console.warn("[centro-informativo-facebook] request failed", { post_id: post.id, error: msg });
    return { ok: false, error: msg };
  }
}

export function isCentroFacebookWebhookConfigured(): boolean {
  return Boolean(getWebhookUrl() && getToken());
}
