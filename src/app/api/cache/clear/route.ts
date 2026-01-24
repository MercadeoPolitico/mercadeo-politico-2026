import { NextResponse } from "next/server";

export const runtime = "nodejs";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const next = url.searchParams.get("next") || "/";

  // This is the closest thing to "reset cache on devices" that browsers support.
  // It clears Cache Storage + other storage areas for this origin.
  const res = NextResponse.redirect(new URL(next, url.origin), { status: 302 });
  res.headers.set("Clear-Site-Data", "\"cache\", \"storage\"");
  res.headers.set("cache-control", "no-store");
  return res;
}

