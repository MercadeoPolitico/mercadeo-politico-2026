import "server-only";
import { createClient } from "@supabase/supabase-js";
import type { SupabaseClient } from "@supabase/supabase-js";

function env(name: string): string | null {
  const v = process.env[name];
  return v && v.trim().length ? v.trim() : null;
}

/**
 * Service-role Supabase client.
 * MUST be used server-side only. Never import this file into client components.
 */
export function createSupabaseAdminClient(): SupabaseClient | null {
  const url = env("NEXT_PUBLIC_SUPABASE_URL");
  const serviceRoleKey = env("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !serviceRoleKey) return null;

  return createClient(url, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
}

