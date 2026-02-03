import { NextResponse } from "next/server";
import { getSiteUrlString } from "@/lib/site";

export const runtime = "nodejs";

/**
 * Public endpoint so the admin (and OAuth link builder) can use the same
 * canonical base URL the server uses for callbacks. Ensures OAuth links
 * never point to localhost when generated from production.
 */
export async function GET() {
  return NextResponse.json({ url: getSiteUrlString() });
}
