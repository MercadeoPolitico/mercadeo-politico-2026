import { Section } from "@/components/Section";

export const metadata = {
  title: "Acerca de",
  description:
    "Principios, ética y transparencia para comunicación política digital (Colombia 2026, Meta).",
};

export default function AboutPage() {
  return (
    <div className="space-y-10">
      <Section
        title="Acerca del proyecto"
        subtitle="Fundación técnica y estratégica para comunicación política digital responsable."
      >
        <div className="grid gap-4 md:grid-cols-2">
          <div className="rounded-2xl border border-border bg-surface p-6">
            <h2 className="text-base font-semibold">Ética y legalidad</h2>
            <p className="mt-2 text-sm text-muted">
              Este proyecto prioriza comunicación verificable, transparente y alineada con buenas prácticas. No
              promueve desinformación, impersonación, ni tácticas de manipulación.
            </p>
          </div>
          <div className="rounded-2xl border border-border bg-surface p-6">
            <h2 className="text-base font-semibold">Escalabilidad</h2>
            <p className="mt-2 text-sm text-muted">
              La arquitectura (Next.js + Supabase) está diseñada para crecer a múltiples candidatos, blogs, y flujos
              automatizados futuros (Make), sin depender de servicios pagos.
            </p>
          </div>
        </div>

        <div className="rounded-2xl border border-border bg-surface p-6">
          <h2 className="text-base font-semibold">Transparencia técnica</h2>
          <ul className="mt-3 space-y-2 text-sm text-muted">
            <li>- Variables de entorno obligatorias para credenciales y URLs.</li>
            <li>- Código legible y mantenible (TypeScript, ESLint, Tailwind).</li>
            <li>- Preparación para sitemap/robots y OpenGraph.</li>
            <li>- Preparación para workers (Railway) sin implementar servicios aún.</li>
          </ul>
        </div>
      </Section>
    </div>
  );
}

