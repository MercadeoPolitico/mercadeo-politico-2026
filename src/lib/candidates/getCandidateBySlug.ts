import { getCandidates } from "./getCandidates";
import type { Candidate } from "./types";

export function getCandidateBySlug(slug: string): Candidate | null {
  return getCandidates().find((c) => c.slug === slug) ?? null;
}

