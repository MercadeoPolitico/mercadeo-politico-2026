import { NextResponse } from "next/server";

export const runtime = "nodejs";

function hasEnv(name: string): boolean {
  const v = process.env[name];
  return Boolean(v && v.trim().length > 0);
}

function supabaseProjectRefFromUrl(url: string | undefined): string | null {
  if (!url) return null;
  try {
    const host = new URL(url).host;
    // Typical: <ref>.supabase.co
    const suffix = ".supabase.co";
    if (host.endsWith(suffix)) return host.slice(0, -suffix.length);
    return host;
  } catch {
    return null;
  }
}

/**
 * Diagnostics endpoint (no secrets).
 * Returns only booleans + runtime project ref (no keys).
 */
export async function GET() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  return NextResponse.json({
    ok: true,
    env: {
      NEXT_PUBLIC_SUPABASE_URL: hasEnv("NEXT_PUBLIC_SUPABASE_URL"),
      NEXT_PUBLIC_SUPABASE_ANON_KEY: hasEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY"),
      SUPABASE_SERVICE_ROLE_KEY: hasEnv("SUPABASE_SERVICE_ROLE_KEY"),
    },
    runtime: {
      supabase_project_ref: supabaseProjectRefFromUrl(url),
    },
  });
}

