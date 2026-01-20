import { createBrowserClient } from "@supabase/ssr";

/**
 * Browser Supabase client (App Router).
 *
 * IMPORTANT:
 * We MUST reference NEXT_PUBLIC_* env vars directly so Next.js can inline them
 * into the client bundle. Do NOT access process.env dynamically.
 */
export function createSupabaseBrowserClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
}

