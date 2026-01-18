import { createClient, type SupabaseClient } from "@supabase/supabase-js";

function requiredEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(
      `Missing environment variable: ${name}. Add it to .env.local (or Vercel Project Settings) and restart the dev server.`,
    );
  }
  return value;
}

let _client: SupabaseClient | null = null;

/**
 * Browser-friendly Supabase client using PUBLIC env vars.
 * - Uses anon key (safe for client-side with proper RLS policies).
 * - Never hardcodes secrets.
 */
export function supabaseClient(): SupabaseClient {
  if (_client) return _client;

  const url = requiredEnv("NEXT_PUBLIC_SUPABASE_URL");
  const anonKey = requiredEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY");

  _client = createClient(url, anonKey);
  return _client;
}

