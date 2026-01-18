import { CandidateCard } from "@/components/CandidateCard";
import { Section } from "@/components/Section";

export const metadata = {
  title: "Candidatos",
  description:
    "Candidatos y datos base para elecciones Colombia 2026 (enfoque Meta). Comunicación ética y transparente.",
};

export default function CandidatesPage() {
  return (
    <div className="space-y-10">
      <Section
        title="Candidatos"
        subtitle="Información básica y enlaces oficiales (cuando existan) para visibilidad digital."
      >
        <div className="grid gap-4 md:grid-cols-2">
          <CandidateCard
            name="Eduardo Buitrago"
            office="Senado"
            party="Salvación Nacional"
            ballotNumber="22"
          />
          <CandidateCard
            name="Jose Angel"
            office="Cámara"
            party="(por definir)"
            ballotNumber="103"
          />
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

