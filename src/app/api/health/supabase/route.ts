import { NextResponse } from "next/server";

export const runtime = "nodejs";

function hasEnv(name: string): boolean {
  const v = process.env[name];
  return Boolean(v && v.trim().length > 0);
}

/**
 * Diagnostics endpoint (no secrets).
 * Returns only booleans indicating whether env vars are present.
 */
export async function GET() {
  return NextResponse.json({
    ok: true,
    env: {
      NEXT_PUBLIC_SUPABASE_URL: hasEnv("NEXT_PUBLIC_SUPABASE_URL"),
      NEXT_PUBLIC_SUPABASE_ANON_KEY: hasEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY"),
      SUPABASE_SERVICE_ROLE_KEY: hasEnv("SUPABASE_SERVICE_ROLE_KEY"),
    },
  });
}

