import Link from "next/link";
import { CandidateCard } from "@/components/CandidateCard";
import { Section } from "@/components/Section";
import { getCandidates } from "@/lib/candidates/getCandidates";
import { siteConfig } from "@/lib/site";
import { TrackedExternalLink } from "@/components/analytics/TrackedExternalLink";

export default function Home() {
  const candidates = getCandidates();
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
              <Link
                className="inline-flex items-center justify-center rounded-full border border-border px-5 py-3 text-sm font-semibold transition-colors hover:bg-surface"
                href="/admin/login"
              >
                Admin login
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
          {candidates.map((c) => (
            <CandidateCard
              key={c.id}
              name={c.name}
              role={c.role}
              party={c.party}
              region={c.region}
              ballotNumber={c.ballotNumber}
              shortBio={c.shortBio}
              href={`/candidates/${c.slug}`}
              proposalHref={`/candidates/${c.slug}#propuesta`}
            />
          ))}
        </div>
        <div className="mt-4 text-sm text-muted">
          <p>
            Esta plataforma se diseña para comunicación política{" "}
            <strong className="text-foreground">ética, legal y transparente</strong>. No promueve desinformación ni
            tácticas engañosas.
          </p>
        </div>
      </Section>

      <Section title="Enlaces oficiales" subtitle="Accesos rápidos a redes sociales y páginas públicas.">
        <div className="grid gap-4 md:grid-cols-2">
          <div className="glass-card p-6">
            <p className="text-sm font-semibold">José Ángel Martínez</p>
            <div className="mt-3 grid gap-2 text-sm">
              <TrackedExternalLink className="underline" candidateSlug="jose-angel-martinez" href="https://www.facebook.com/JoseAngelFirmesporlaPatria/">
                Facebook · Firmes por la Patria
              </TrackedExternalLink>
              <TrackedExternalLink className="underline" candidateSlug="jose-angel-martinez" href="https://www.facebook.com/angelesparavillavicencio7/">
                Facebook · Ángeles para Villavicencio
              </TrackedExternalLink>
              <TrackedExternalLink className="underline" candidateSlug="jose-angel-martinez" href="https://www.instagram.com/angelfirmesporlapatria/">
                Instagram · @angelfirmesporlapatria
              </TrackedExternalLink>
              <TrackedExternalLink className="underline" candidateSlug="jose-angel-martinez" href="https://www.threads.net/@jose.martinez08121978">
                Threads · @jose.martinez08121978
              </TrackedExternalLink>
              <TrackedExternalLink className="underline" candidateSlug="jose-angel-martinez" href="https://www.tiktok.com/@jose.angel.martin725">
                TikTok · @jose.angel.martin725
              </TrackedExternalLink>
              <TrackedExternalLink className="underline" candidateSlug="jose-angel-martinez" href="https://x.com/joseangelFirmes">
                X · @joseangelFirmes
              </TrackedExternalLink>
            </div>
          </div>

          <div className="glass-card p-6">
            <p className="text-sm font-semibold">Eduard Buitrago Acero</p>
            <div className="mt-3 grid gap-2 text-sm">
              <TrackedExternalLink className="underline" candidateSlug="eduardo-buitrago" href="https://x.com/yosoyeduardb">
                X · @yosoyeduardb
              </TrackedExternalLink>
              <TrackedExternalLink
                className="underline"
                candidateSlug="eduardo-buitrago"
                href="https://www.instagram.com/soyeduardbuitrago?igsh=bnpsNmI2MGZ3azQy"
              >
                Instagram · @soyeduardbuitrago
              </TrackedExternalLink>
              <TrackedExternalLink className="underline" candidateSlug="eduardo-buitrago" href="https://www.youtube.com/@soyeduardbuitrago7801">
                YouTube · @soyeduardbuitrago7801
              </TrackedExternalLink>
              <TrackedExternalLink className="underline" candidateSlug="eduardo-buitrago" href="https://www.facebook.com/share/17x8kFiAGs/">
                Facebook
              </TrackedExternalLink>
            </div>
          </div>
        </div>
      </Section>
    </div>
  );
}
