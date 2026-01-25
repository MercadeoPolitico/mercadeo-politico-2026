import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

function safeHttpUrl(raw: string | null): URL | null {
  if (!raw) return null;
  const t = String(raw).trim();
  if (!t || t.length > 2000) return null;
  try {
    const u = new URL(t);
    if (u.protocol !== "http:" && u.protocol !== "https:") return null;
    return u;
  } catch {
    return null;
  }
}

function isPrivateHost(host: string): boolean {
  const h = host.toLowerCase();
  return h === "localhost" || h.endsWith(".local") || h.endsWith(".internal");
}

export async function GET(req: NextRequest) {
  const url = safeHttpUrl(req.nextUrl.searchParams.get("url"));
  if (!url || isPrivateHost(url.hostname)) {
    return NextResponse.redirect(new URL("/fallback/news.svg", req.url));
  }

  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 6500);

  try {
    const r = await fetch(url.toString(), {
      method: "GET",
      cache: "no-store",
      redirect: "follow",
      signal: ctrl.signal,
      headers: {
        // Generic UA to avoid some hotlink blocks; still best-effort.
        "user-agent": "Mozilla/5.0 (compatible; mp26/1.0; +https://mercadeo-politico-2026.vercel.app)",
        accept: "image/avif,image/webp,image/*,*/*;q=0.8",
      },
    });

    const ct = r.headers.get("content-type") ?? "";
    if (!r.ok || !ct.toLowerCase().startsWith("image/")) {
      return NextResponse.redirect(new URL("/fallback/news.svg", req.url));
    }

    // Hard cap to avoid abuse.
    const len = Number(r.headers.get("content-length") ?? "0");
    if (Number.isFinite(len) && len > 3_000_000) return NextResponse.redirect(new URL("/fallback/news.svg", req.url));

    const buf = await r.arrayBuffer();
    if (buf.byteLength > 3_000_000) return NextResponse.redirect(new URL("/fallback/news.svg", req.url));

    const res = new NextResponse(buf, {
      status: 200,
      headers: {
        "content-type": ct,
        "cache-control": "public, max-age=86400, s-maxage=86400, stale-while-revalidate=86400",
      },
    });
    return res;
  } catch {
    return NextResponse.redirect(new URL("/fallback/news.svg", req.url));
  } finally {
    clearTimeout(t);
  }
}

