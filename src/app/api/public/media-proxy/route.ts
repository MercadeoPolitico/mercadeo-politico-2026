import { NextResponse } from "next/server";

export const runtime = "nodejs";

function isPrivateIpHost(hostname: string): boolean {
  const h = hostname.trim().toLowerCase();
  if (!h) return true;
  if (h === "localhost" || h.endsWith(".localhost")) return true;
  // Block raw IPv4/IPv6 literals to avoid SSRF to private networks.
  // (We can expand later if we need explicit IP allowlisting.)
  const isIpv4 = /^\d{1,3}(\.\d{1,3}){3}$/.test(h);
  const isIpv6 = h.includes(":");
  return isIpv4 || isIpv6;
}

function allowedHostsFromEnv(): string[] {
  const allow = new Set<string>();
  // Always allow Wikimedia (we publish CC images from there)
  allow.add("upload.wikimedia.org");
  allow.add("commons.wikimedia.org");

  // Allow our Supabase project host (public storage URLs)
  const supabaseUrl = String(process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || "").trim();
  try {
    if (supabaseUrl) allow.add(new URL(supabaseUrl).host.toLowerCase());
  } catch {
    // ignore
  }

  // Conservative fallback: allow generic Supabase hosts only (still public internet)
  // This keeps existing public storage URLs working even if env is missing.
  allow.add("supabase.co");
  allow.add("supabase.in");

  return Array.from(allow);
}

function isAllowedHost(targetUrl: string): boolean {
  try {
    const u = new URL(targetUrl);
    const hostname = u.hostname.toLowerCase();
    if (!hostname) return false;
    if (isPrivateIpHost(hostname)) return false;
    const allowed = allowedHostsFromEnv();
    return allowed.some((h) => hostname === h || hostname.endsWith(`.${h}`));
  } catch {
    return false;
  }
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const target = url.searchParams.get("url") ?? "";
  if (!target) return NextResponse.json({ error: "url_required" }, { status: 400 });
  if (!/^https?:\/\//i.test(target)) return NextResponse.json({ error: "url_invalid" }, { status: 400 });
  if (!isAllowedHost(target)) return NextResponse.json({ error: "host_not_allowed" }, { status: 403 });

  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 8000);
  try {
    const resp = await fetch(target, {
      method: "GET",
      redirect: "follow",
      cache: "no-store",
      signal: ctrl.signal,
      headers: {
        // Some CDNs reject unknown UAs.
        "user-agent": "Mozilla/5.0 (compatible; mercadeo-politico-2026/1.0)",
        accept: "image/avif,image/webp,image/apng,image/*,*/*;q=0.8",
      },
    });

    if (!resp.ok) return NextResponse.json({ error: "upstream_failed", status: resp.status }, { status: 502 });

    const ct = resp.headers.get("content-type") ?? "application/octet-stream";
    if (!ct.toLowerCase().startsWith("image/")) {
      return NextResponse.json({ error: "not_image", content_type: ct }, { status: 415 });
    }

    // Soft size cap to avoid proxying huge blobs.
    const len = Number(resp.headers.get("content-length") ?? "0");
    if (Number.isFinite(len) && len > 8_000_000) return NextResponse.json({ error: "too_large" }, { status: 413 });

    const buf = await resp.arrayBuffer();
    if (buf.byteLength > 8_000_000) return NextResponse.json({ error: "too_large" }, { status: 413 });

    const headers = new Headers();
    headers.set("content-type", ct);
    headers.set("cache-control", "public, max-age=300, s-maxage=1800");
    headers.set("x-content-type-options", "nosniff");

    return new NextResponse(buf, { status: 200, headers });
  } catch {
    return NextResponse.json({ error: "proxy_failed" }, { status: 502 });
  } finally {
    clearTimeout(t);
  }
}
