import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Section } from "@/components/Section";
import { getCandidateBySlug } from "@/lib/candidates/getCandidateBySlug";
import { getSiteUrlString } from "@/lib/site";
import { PixelFire } from "@/components/analytics/PixelFire";
import { createSupabaseServerClient } from "@/lib/supabase/server";

type PageProps = {
  params: Promise<{ slug: string }>;
  searchParams?: Promise<{ ref?: string }>;
};

function titleFor(candidate: { name: string; role: string; region: string }): string {
  if (candidate.role === "Cámara de Representantes") {
    return `${candidate.name} | Cámara de Representantes | ${candidate.region}`;
  }
  return `${candidate.name} | Senado de la República | Colombia`;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params;
  const candidate = getCandidateBySlug(slug);
  if (!candidate) return {};

  const canonical = `${getSiteUrlString()}/candidates/${candidate.slug}`;

  return {
    title: titleFor(candidate),
    description: candidate.shortBio,
    alternates: { canonical },
  };
}

export default async function CandidatePage({ params, searchParams }: PageProps) {
  const { slug } = await params;
  const candidate = getCandidateBySlug(slug);
  if (!candidate) notFound();

  const supabase = await createSupabaseServerClient();
  const { data: dbPol } = supabase
    ? await supabase
        .from("politicians")
        .select("id,slug,name,office,party,region,ballot_number,biography,proposals")
        .eq("slug", slug)
        .maybeSingle()
    : { data: null };

  const view = dbPol
    ? {
        id: dbPol.id,
        slug: dbPol.slug,
        name: dbPol.name,
        role: dbPol.office,
        party: dbPol.party,
        region: dbPol.region,
        ballotNumber: dbPol.ballot_number ?? candidate.ballotNumber,
        biography: dbPol.biography?.trim() ? dbPol.biography : candidate.biography,
        proposal: dbPol.proposals?.trim() ? dbPol.proposals : candidate.proposal ?? "",
        shortBio: candidate.shortBio,
      }
    : candidate;

  const sp = searchParams ? await searchParams : undefined;
  const ref = sp?.ref;
  const refType =
    ref === "shared" ? ("shared" as const) : ref === "social" ? ("social" as const) : ref === "direct" ? ("direct" as const) : undefined;

  const paragraphs = view.biography
    .split(/\n{2,}/g)
    .map((p: string) => p.trim())
    .filter(Boolean);

  const proposalText = "proposal" in view ? (view.proposal as string) : "";
  const proposalParagraphs = proposalText
    ? proposalText
        .split(/\n{2,}/g)
        .map((p: string) => p.trim())
        .filter(Boolean)
    : [];

  return (
    <div className="space-y-10">
      <PixelFire candidateSlug={view.slug} eventType={ref === "shared" ? "shared_link_visit" : "profile_view"} refType={refType} />
      <Section>
        <header className="space-y-2">
          <h1 className="text-balance text-3xl font-semibold tracking-tight md:text-4xl">{view.name}</h1>
          <div className="text-sm text-muted">
            <p>
              {"role" in view ? view.role : candidate.role}
              {"party" in view && view.party ? ` · ${view.party}` : candidate.party ? ` · ${candidate.party}` : ""}
            </p>
            <p>Región: {"region" in view ? view.region : candidate.region}</p>
            <p>No. {"ballotNumber" in view ? view.ballotNumber : candidate.ballotNumber}</p>
          </div>
        </header>

        <article className="glass-card p-6">
          <h2 className="text-lg font-semibold">Biografía</h2>
          <div className="mt-3 space-y-4 text-sm text-muted">
            {paragraphs.length > 0 ? (
              paragraphs.map((p: string, idx: number) => <p key={idx}>{p}</p>)
            ) : (
              <p>{"biography" in view ? view.biography : candidate.biography}</p>
            )}
          </div>
        </article>

        <article id="propuesta" className="glass-card p-6">
          <h2 className="text-lg font-semibold">Propuesta</h2>
          <div className="mt-3 space-y-4 text-sm text-muted">
            {proposalParagraphs.length > 0 ? (
              proposalParagraphs.map((p: string, idx: number) => <p key={idx}>{p}</p>)
            ) : (
              <p>Contenido en preparación. Se publicará únicamente después de revisión y aprobación editorial.</p>
            )}
          </div>
        </article>
      </Section>
    </div>
  );
}

