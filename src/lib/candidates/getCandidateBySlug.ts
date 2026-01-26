import { getCandidates } from "./getCandidates";
import type { Candidate } from "./types";

export async function getCandidateBySlug(slug: string): Promise<Candidate | null> {
  // Accept both canonical slug and stable internal id as inputs.
  // This allows us to evolve public slugs without breaking older links.
  const cands = await getCandidates();
  return cands.find((c) => c.slug === slug || c.id === slug) ?? null;
}

