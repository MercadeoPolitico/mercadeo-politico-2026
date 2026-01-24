import "server-only";

export type OpenGraphMedia = {
  image_url: string | null;
  video_url: string | null;
  site_name: string | null;
  title: string | null;
};

function safeUrlMaybe(raw: string, baseUrl: string): string | null {
  const v = String(raw || "").trim();
  if (!v) return null;
  try {
    const u = new URL(v, baseUrl);
    if (u.protocol !== "http:" && u.protocol !== "https:") return null;
    return u.toString();
  } catch {
    return null;
  }
}

function extractMeta(html: string, key: string): string | null {
  // property="og:image" content="..."
  const re1 = new RegExp(`<meta[^>]+property=["']${key}["'][^>]+>`, "i");
  const m1 = html.match(re1)?.[0];
  if (m1) {
    const c = m1.match(/content=["']([^"']+)["']/i)?.[1];
    if (c) return c.trim();
  }
  // name="twitter:image" content="..."
  const re2 = new RegExp(`<meta[^>]+name=["']${key}["'][^>]+>`, "i");
  const m2 = html.match(re2)?.[0];
  if (m2) {
    const c = m2.match(/content=["']([^"']+)["']/i)?.[1];
    if (c) return c.trim();
  }
  return null;
}

export async function fetchOpenGraphMedia(args: { url: string; timeout_ms?: number }): Promise<OpenGraphMedia | null> {
  const target = String(args.url || "").trim();
  if (!target) return null;
  const timeoutMs = typeof args.timeout_ms === "number" ? args.timeout_ms : 6500;

  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);

  try {
    const resp = await fetch(target, {
      method: "GET",
      redirect: "follow",
      cache: "no-store",
      signal: ctrl.signal,
      headers: {
        // Keep it generic; some outlets block unknown UAs.
        "user-agent": "Mozilla/5.0 (compatible; mercadeo-politico-2026/1.0; +https://mercadeo-politico-2026.vercel.app)",
        accept: "text/html,application/xhtml+xml",
      },
    }).catch(() => null);

    if (!resp?.ok) return null;
    const text = await resp.text();
    // Cap parsing effort; we only need head-ish meta tags.
    const html = text.slice(0, 250_000);

    const ogImage = extractMeta(html, "og:image");
    const twImage = extractMeta(html, "twitter:image");
    const ogVideo = extractMeta(html, "og:video");
    const ogSite = extractMeta(html, "og:site_name");
    const ogTitle = extractMeta(html, "og:title");

    const image_url = safeUrlMaybe(ogImage || twImage || "", target);
    const video_url = safeUrlMaybe(ogVideo || "", target);

    return {
      image_url,
      video_url,
      site_name: ogSite ? ogSite.trim() : null,
      title: ogTitle ? ogTitle.trim() : null,
    };
  } catch {
    return null;
  } finally {
    clearTimeout(t);
  }
}

