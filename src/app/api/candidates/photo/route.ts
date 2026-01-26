import { NextResponse } from "next/server";

export const runtime = "nodejs";

function baseSupabaseUrl(): string | null {
  const base = (process.env.NEXT_PUBLIC_SUPABASE_URL ?? "").trim();
  return base ? base.replace(/\/+$/, "") : null;
}

function storageUrlForCandidate(id: string): string | null {
  const base = baseSupabaseUrl();
  if (!base) return null;
  // Path used by the admin panel: `${id}/profile/profile`
  return `${base}/storage/v1/object/public/politician-media/${encodeURIComponent(id)}/profile/profile`;
}

function fallbackSvg() {
  const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256" viewBox="0 0 256 256">
  <defs>
    <radialGradient id="g" cx="30%" cy="25%" r="80%">
      <stop offset="0%" stop-color="#93c5fd" stop-opacity="0.28"/>
      <stop offset="55%" stop-color="#22c55e" stop-opacity="0.10"/>
      <stop offset="100%" stop-color="#0b2f54" stop-opacity="1"/>
    </radialGradient>
  </defs>
  <rect width="256" height="256" rx="128" fill="url(#g)"/>
  <circle cx="128" cy="102" r="42" fill="rgba(255,255,255,0.18)"/>
  <path d="M56 220c10-44 42-72 72-72s62 28 72 72" fill="rgba(255,255,255,0.14)"/>
  <circle cx="128" cy="128" r="124" fill="none" stroke="rgba(255,255,255,0.18)" stroke-width="2"/>
</svg>`;
  return new NextResponse(svg, {
    headers: {
      "content-type": "image/svg+xml; charset=utf-8",
      // Cache on CDN/browser; changes happen by uploading to Storage (different URL target).
      "cache-control": "public, max-age=3600, s-maxage=86400, stale-while-revalidate=604800",
    },
  });
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const id = (searchParams.get("id") ?? "").trim();
  if (!id) return fallbackSvg();

  const storageUrl = storageUrlForCandidate(id);
  if (!storageUrl) return fallbackSvg();

  // Cheap existence check: GET with tight timeout.
  // Note: Supabase Storage public objects may not reliably support HEAD across all deployments,
  // which would cause false negatives and fall back to the placeholder.
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 1400);
  try {
    const r = await fetch(storageUrl, {
      method: "GET",
      cache: "no-store",
      redirect: "follow",
      signal: ctrl.signal,
      // Try to avoid downloading the full image during the probe.
      headers: { range: "bytes=0-0" },
    });
    // If Storage doesn't support range requests, it may return 200.
    if (r.ok || r.status === 206) return NextResponse.redirect(storageUrl, 302);
    // Ensure the body is not kept open.
    try {
      r.body?.cancel();
    } catch {
      // ignore
    }
  } catch {
    // fall through to svg
  } finally {
    clearTimeout(t);
  }

  return fallbackSvg();
}

