import Link from "next/link";
import { CandidateCard } from "@/components/CandidateCard";
import { Section } from "@/components/Section";
import { getCandidates } from "@/lib/candidates/getCandidates";

export const metadata = {
  title: "Candidatos",
  description:
    "Candidatos y datos base para elecciones Colombia 2026 (enfoque Meta). Comunicación ética y transparente.",
};

export default function CandidatesPage() {
  const candidates = getCandidates();
  const senate = candidates.filter((c) => c.role === "Senado de la República");
  const house = candidates.filter((c) => c.role === "Cámara de Representantes");

  return (
    <div className="space-y-10">
      <Section
        title="Candidatos"
        subtitle="Información básica y enlaces oficiales (cuando existan) para visibilidad digital."
      >
        <div className="space-y-8">
          <div className="space-y-3">
            <h2 className="text-lg font-semibold">Senado de la República</h2>
            <div className="grid gap-4 md:grid-cols-2">
              {senate.map((c) => (
                <CandidateCard
                  key={c.id}
                  name={c.name}
                  role={c.role}
                  party={c.party}
                  region={c.region}
                  ballotNumber={c.ballotNumber}
                  shortBio={c.shortBio}
                  href={`/candidates/${c.slug}`}
                />
              ))}
            </div>
          </div>

          <div className="space-y-3">
            <h2 className="text-lg font-semibold">Cámara de Representantes</h2>
            <div className="grid gap-4 md:grid-cols-2">
              {house.map((c) => (
                <CandidateCard
                  key={c.id}
                  name={c.name}
                  role={c.role}
                  party={c.party}
                  region={c.region}
                  ballotNumber={c.ballotNumber}
                  shortBio={c.shortBio}
                  href={`/candidates/${c.slug}`}
                />
              ))}
            </div>
          </div>
        </div>

        <div className="mt-6 text-sm">
          <Link className="font-semibold underline-offset-4 hover:underline" href="/blog">
            Ver blog
          </Link>
        </div>

        <div className="mt-6 rounded-2xl border border-border bg-surface p-6 text-sm text-muted">
          <h2 className="text-base font-semibold text-foreground">Compromiso de comunicación</h2>
          <ul className="mt-3 space-y-2">
            <li>- Transparencia sobre autoría y objetivos del contenido.</li>
            <li>- Enfoque en propuestas, servicios al ciudadano y educación cívica.</li>
            <li>- No se incluyen tácticas engañosas, manipulación o desinformación.</li>
          </ul>
        </div>
      </Section>
    </div>
  );
}

