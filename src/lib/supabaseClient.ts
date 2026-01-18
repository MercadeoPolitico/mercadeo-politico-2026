import { createClient, type SupabaseClient } from "@supabase/supabase-js";

let _client: SupabaseClient | null = null;

/**
 * Browser-friendly Supabase client using PUBLIC env vars.
 * - Uses anon key (safe for client-side with proper RLS policies).
 * - Never hardcodes secrets.
 *
 * This function is intentionally tolerant:
 * - If env vars are missing/misconfigured, it returns null (callers can show a friendly message).
 */
export function supabaseClient(): SupabaseClient | null {
  if (_client) return _client;

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim();

  if (!url || !anonKey) return null;

  _client = createClient(url, anonKey);
  return _client;
}

export function isSupabaseConfigured(): boolean {
  return Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim());
}

export function getSupabaseConfigError(): string | null {
  if (isSupabaseConfigured()) return null;
  return "Supabase no está configurado: faltan NEXT_PUBLIC_SUPABASE_URL y/o NEXT_PUBLIC_SUPABASE_ANON_KEY.";
}

