import type { BlogPost } from "./types";

/**
 * Placeholder-only blog list.
 *
 * Later: replace with a read-only Supabase query (no mutations, RLS enforced).
 */
export function getBlogPosts(): BlogPost[] {
  return [];
}

