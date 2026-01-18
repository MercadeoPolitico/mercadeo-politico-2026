import type { Candidate } from "./types";
import { eduardoBuitrago } from "@/content/candidates/eduardo-buitrago";
import { joseAngelMartinez } from "@/content/candidates/jose-angel-martinez";

/**
 * Placeholder-only candidates list.
 *
 * - No political persuasion content here.
 * - No production data hardcoded.
 * - Designed to be replaced by a read-only Supabase query later.
 */
export function getCandidates(): Candidate[] {
  return [
    // Deterministic order: Senate first, then House.
    eduardoBuitrago,
    joseAngelMartinez,
  ];
}

