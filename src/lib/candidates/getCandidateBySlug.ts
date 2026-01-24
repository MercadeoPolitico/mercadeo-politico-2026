import { getCandidates } from "./getCandidates";
import type { Candidate } from "./types";

export function getCandidateBySlug(slug: string): Candidate | null {
  // Accept both canonical slug and stable internal id as inputs.
  // This allows us to evolve public slugs without breaking older links.
  return getCandidates().find((c) => c.slug === slug || c.id === slug) ?? null;
}

