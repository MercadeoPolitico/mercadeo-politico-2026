import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Section } from "@/components/Section";
import { getCandidateBySlug } from "@/lib/candidates/getCandidateBySlug";
import { getSiteUrlString } from "@/lib/site";

type PageProps = {
  params: Promise<{ slug: string }>;
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

export default async function CandidatePage({ params }: PageProps) {
  const { slug } = await params;
  const candidate = getCandidateBySlug(slug);
  if (!candidate) notFound();

  const paragraphs = candidate.biography
    .split(/\n{2,}/g)
    .map((p) => p.trim())
    .filter(Boolean);

  return (
    <div className="space-y-10">
      <Section>
        <header className="space-y-2">
          <h1 className="text-balance text-3xl font-semibold tracking-tight md:text-4xl">{candidate.name}</h1>
          <div className="text-sm text-muted">
            <p>
              {candidate.role}
              {candidate.party ? ` · ${candidate.party}` : ""}
            </p>
            <p>Región: {candidate.region}</p>
            <p>No. {candidate.ballotNumber}</p>
          </div>
        </header>

        <article className="rounded-2xl border border-border bg-surface p-6">
          <h2 className="text-lg font-semibold">Biografía</h2>
          <div className="mt-3 space-y-4 text-sm text-muted">
            {paragraphs.length > 0 ? (
              paragraphs.map((p, idx) => <p key={idx}>{p}</p>)
            ) : (
              <p>{candidate.biography}</p>
            )}
          </div>
        </article>
      </Section>
    </div>
  );
}

