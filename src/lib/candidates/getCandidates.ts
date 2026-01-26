import "server-only";

import type { Candidate, CandidateRole } from "./types";
import { eduardBuitrago } from "@/content/candidates/eduard-buitrago";
import { joseAngelMartinez } from "@/content/candidates/jose-angel-martinez";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { unstable_noStore as noStore } from "next/cache";

/**
 * Placeholder-only candidates list.
 *
 * - No political persuasion content here.
 * - No production data hardcoded.
 * - Designed to be replaced by a read-only Supabase query later.
 */
function roleFromOffice(office: string): CandidateRole {
  const o = String(office || "").toLowerCase();
  return o.includes("senado") ? "Senado de la República" : "Cámara de Representantes";
}

function publicPhotoUrlFor(politicianId: string): string | null {
  // Go through our API so we can serve a fallback image if storage is empty.
  return `/api/candidates/photo?id=${encodeURIComponent(politicianId)}`;
}

export async function getCandidates(): Promise<Candidate[]> {
  // Candidates are admin-edited frequently; do not cache server-rendered results.
  noStore();
  const admin = createSupabaseAdminClient();
  if (!admin) {
    return [eduardBuitrago, joseAngelMartinez];
  }

  const { data, error } = await admin
    .from("politicians")
    .select("id,slug,name,office,party,region,ballot_number,biography,proposals,updated_at")
    .order("name", { ascending: true });

  if (error || !Array.isArray(data) || data.length === 0) {
    return [eduardBuitrago, joseAngelMartinez];
  }

  const fallbackById = new Map<string, Candidate>([
    [eduardBuitrago.id, eduardBuitrago],
    [joseAngelMartinez.id, joseAngelMartinez],
  ]);

  const mapped = data.map((p: any) => {
    const id = String(p.id);
    const fallback = fallbackById.get(id) ?? null;
    const role = roleFromOffice(String(p.office || ""));
    const ballotNumber = typeof p.ballot_number === "number" && Number.isFinite(p.ballot_number) ? p.ballot_number : fallback?.ballotNumber ?? 0;
    return {
      id,
      slug: String(p.slug || id),
      name: String(p.name || fallback?.name || id),
      role,
      ballotNumber,
      region: String(p.region || fallback?.region || ""),
      party: typeof p.party === "string" && p.party.trim() ? p.party.trim() : fallback?.party,
      photoUrl: publicPhotoUrlFor(id),
      biography: typeof p.biography === "string" && p.biography.trim().length ? p.biography : fallback?.biography ?? "",
      shortBio: fallback?.shortBio ?? "",
      proposal: typeof p.proposals === "string" && p.proposals.trim().length ? p.proposals : fallback?.proposal ?? "",
    } as Candidate;
  });

  // Senate first, then House (stable)
  return [
    ...mapped.filter((c) => c.role === "Senado de la República"),
    ...mapped.filter((c) => c.role === "Cámara de Representantes"),
  ];
}

