export type CandidateRole = "Senado de la República" | "Cámara de Representantes";

/**
 * Candidate model (content-driven foundation).
 *
 * Rules:
 * - Political content lives in `src/content` (single source of truth).
 * - Access happens through accessor functions in `src/lib/candidates/*`.
 * - Ready to be replaced by a read-only Supabase query later (RLS enforced).
 */
export type Candidate = {
  id: string;
  slug: string;
  name: string;
  role: CandidateRole;
  ballotNumber: number;
  region: string;
  party?: string;
  biography: string; // long, multi-paragraph plain text
  shortBio: string; // 2–3 lines
  proposal?: string; // optional long plain text (public)
};

