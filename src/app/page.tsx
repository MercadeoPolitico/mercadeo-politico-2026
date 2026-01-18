import Link from "next/link";
import { CandidateCard } from "@/components/CandidateCard";
import { Section } from "@/components/Section";
import { siteConfig } from "@/lib/site";

export default function Home() {
  return (
    <div className="space-y-12">
      <Section>
        <div className="grid gap-6 md:grid-cols-2 md:items-center">
          <div className="space-y-4">
            <p className="text-sm font-medium text-muted">
              Enfoque regional: <span className="text-foreground">Meta, Colombia</span>
            </p>
            <h1 className="text-balance text-4xl font-semibold tracking-tight md:text-5xl">
              {siteConfig.name}
            </h1>
            <p className="text-pretty text-lg text-muted">
              Plataforma de mercadeo político digital para elecciones 2026, con énfasis en comunicación ética,
              transparente y orientada a educación cívica.
            </p>
            <div className="flex flex-col gap-3 sm:flex-row">
              <Link
                className="inline-flex items-center justify-center rounded-full bg-foreground px-5 py-3 text-sm font-semibold text-background transition-colors hover:opacity-90"
                href="/candidates"
              >
                Ver candidatos
              </Link>
              <Link
                className="inline-flex items-center justify-center rounded-full border border-border px-5 py-3 text-sm font-semibold transition-colors hover:bg-surface"
                href="/about"
              >
                Principios y transparencia
              </Link>
            </div>
          </div>

          <div className="rounded-2xl border border-border bg-surface p-6">
            <h2 className="text-lg font-semibold">Propósito</h2>
            <ul className="mt-3 space-y-2 text-sm text-muted">
              <li>
                - Sitio público con SEO (metadata, OpenGraph, robots y sitemap listos)
              </li>
              <li>- Blog para contenido político y educación cívica</li>
              <li>- Base para automatización de contenidos (Make en el futuro)</li>
              <li>- Arquitectura lista para escalar a más candidatos</li>
            </ul>
          </div>
        </div>
      </Section>

      <Section title="Candidatos (Meta, 2026)" subtitle="Información base para presencia y visibilidad digital.">
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
        <div className="mt-4 text-sm text-muted">
          <p>
            Esta plataforma se diseña para comunicación política{" "}
            <strong className="text-foreground">ética, legal y transparente</strong>. No promueve desinformación ni
            tácticas engañosas.
          </p>
        </div>
      </Section>
    </div>
  );
}
