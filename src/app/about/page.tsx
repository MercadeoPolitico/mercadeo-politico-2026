import { Section } from "@/components/Section";
import { PublicPageShell } from "@/components/PublicPageShell";

export const metadata = {
  title: "Acerca de",
  description:
    "Principios, ética y transparencia para comunicación política digital (Colombia 2026).",
};

export default function AboutPage() {
  return (
    <PublicPageShell className="space-y-10">
      <Section
        title="Principios y confianza"
        subtitle="Comunicación serena para una seguridad proactiva: verificable, respetuosa y enfocada en el territorio."
      >
        <div className="grid gap-4 md:grid-cols-2">
          <div className="glass-card p-6">
            <h2 className="text-base font-semibold">Ética y legalidad</h2>
            <p className="mt-2 text-sm text-muted">
              Priorizamos comunicación verificable y responsable. No promovemos desinformación, suplantación de identidad,
              manipulación emocional ni ataques personales.
            </p>
          </div>
          <div className="glass-card p-6">
            <h2 className="text-base font-semibold">Seguridad proactiva</h2>
            <p className="mt-2 text-sm text-muted">
              El enfoque es anticiparse: prevención, presencia institucional y soluciones con legalidad. La jerarquía visual
              y el contenido guían al ciudadano hacia información clara y contextual.
            </p>
          </div>
        </div>

        <div className="glass-card p-6">
          <h2 className="text-base font-semibold">Centro informativo ciudadano</h2>
          <ul className="mt-3 space-y-2 text-sm text-muted">
            <li>- Publica notas breves con revisión humana.</li>
            <li>- Cuando hay fuente disponible, se muestra enlace.</li>
            <li>- No se muestran métricas ni datos personales.</li>
            <li>- El contenido automático queda primero en cola de revisión.</li>
          </ul>
        </div>
      </Section>
    </PublicPageShell>
  );
}

