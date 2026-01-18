import { createClient } from "@supabase/supabase-js";

/**
 * Railway Worker (foundation)
 *
 * - Long-running, safe-by-default process
 * - No service-role usage
 * - No writes/mutations
 * - Does not print secrets (ever)
 *
 * Intended future usage:
 * - scheduled jobs (content pipeline, ingestion hooks, queue consumers)
 * - read-only health checks against Supabase (optional)
 */

function isConfigured(): boolean {
  return Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
}

function start() {
  const configured = isConfigured();

  // Create client only if configured. We do not log env values.
  const supabase = configured
    ? createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!)
    : null;

  // Keep the process alive for Railway worker hosting.
  // This is intentionally minimal: it demonstrates a real, stable worker process
  // without performing any political actions or database mutations.
  const intervalMs = 60_000;
  setInterval(async () => {
    if (!supabase) return;
    // Optional lightweight call: fetch current session (does not write, does not require DB tables).
    // We intentionally ignore the result to avoid logging anything.
    await supabase.auth.getSession();
  }, intervalMs);
}

start();

