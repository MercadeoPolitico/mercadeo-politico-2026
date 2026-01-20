import Link from "next/link";
import { CandidateCard } from "@/components/CandidateCard";
import { Section } from "@/components/Section";
import { getCandidates } from "@/lib/candidates/getCandidates";
import { siteConfig } from "@/lib/site";
import { TrackedExternalLink } from "@/components/analytics/TrackedExternalLink";

export default function Home() {
  const candidates = getCandidates();
  return (
    <div className="space-y-14">
      <Section>
        <div className="grid gap-8 lg:grid-cols-2 lg:items-center">
          <div className="space-y-5">
            <p className="text-sm font-medium text-muted">
              Colombia 2026 · <span className="text-foreground">Seguridad proactiva</span>
            </p>
            <h1 className="text-balance text-4xl font-semibold tracking-tight md:text-5xl">
              Seguridad que se anticipa. Instituciones que responden.
            </h1>
            <p className="text-pretty text-lg text-muted">
              Comunicación serena y verificable para ciudadanía: propuestas, contexto territorial y decisiones claras. Sin desinformación,
              sin miedo, sin extremos.
            </p>

            <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap">
              <Link
                className="inline-flex items-center justify-center rounded-full bg-amber-500 px-6 py-3 text-sm font-semibold text-slate-950 transition hover:bg-amber-400"
                href="/centro-informativo"
              >
                Centro informativo ciudadano
              </Link>
              <Link
                className="inline-flex items-center justify-center rounded-full border border-white/20 bg-white/5 px-6 py-3 text-sm font-semibold text-foreground backdrop-blur-md transition hover:bg-white/10"
                href="/candidates"
              >
                Conoce a los candidatos
              </Link>
              <Link className="glass-button" href="/about">
                Principios y confianza
              </Link>
            </div>

            <p className="text-xs text-muted">
              Enfoque: prevención, presencia territorial y soluciones institucionales. El contenido público se publica con revisión editorial.
            </p>
          </div>

          <div className="glass-card relative overflow-hidden p-8">
            <div className="absolute inset-0 bg-gradient-to-br from-amber-400/10 via-cyan-400/10 to-red-500/10" />
            <div className="relative flex items-center gap-6">
              <div className="relative">
                <span className="absolute inset-0 rounded-full bg-cyan-400/25 blur-2xl" />
                <img
                  src="/icon.png"
                  alt="Marleny Owl Guardian"
                  className="relative h-28 w-28 rounded-full border border-white/20 object-cover mb-owl-pulse"
                />
              </div>
              <div className="space-y-2">
                <p className="text-sm font-semibold">Guía de lectura</p>
                <p className="text-sm text-muted">
                  Encontrarás propuestas, enlaces oficiales y el <strong className="text-foreground">Centro informativo ciudadano</strong> con
                  contexto y fuentes cuando existan.
                </p>
                <div className="flex flex-wrap gap-2">
                  <span className="rounded-full border border-white/15 bg-white/5 px-3 py-1 text-xs text-muted">Transparencia</span>
                  <span className="rounded-full border border-white/15 bg-white/5 px-3 py-1 text-xs text-muted">Orden</span>
                  <span className="rounded-full border border-white/15 bg-white/5 px-3 py-1 text-xs text-muted">Territorio</span>
                </div>
              </div>
            </div>

            <div className="relative mt-6 grid gap-3 sm:grid-cols-3">
              <div className="rounded-3xl border border-white/15 bg-white/5 p-4">
                <p className="text-sm font-semibold">Prevención</p>
                <p className="mt-1 text-xs text-muted">Acción temprana para reducir riesgos antes de que escalen.</p>
              </div>
              <div className="rounded-3xl border border-white/15 bg-white/5 p-4">
                <p className="text-sm font-semibold">Presencia</p>
                <p className="mt-1 text-xs text-muted">Cercanía institucional y control territorial con legalidad.</p>
              </div>
              <div className="rounded-3xl border border-white/15 bg-white/5 p-4">
                <p className="text-sm font-semibold">Confianza</p>
                <p className="mt-1 text-xs text-muted">Mensajes sobrios, verificables y sin manipulación.</p>
              </div>
            </div>
          </div>
        </div>
      </Section>

      <Section title="Propuestas clave" subtitle="Pilares de una seguridad proactiva: serenidad, legalidad y resultados.">
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          {[
            { t: "Seguridad con legalidad", d: "Fortalecer instituciones y proteger al ciudadano honesto con reglas claras." },
            { t: "Lucha anticorrupción", d: "Tolerancia cero: transparencia, control y sanción efectiva." },
            { t: "Oportunidades reales", d: "Empleo y educación como prevención estructural de la violencia." },
            { t: "Territorio y comunidad", d: "Acción con enfoque local: barrios, veredas y municipios." },
          ].map((x) => (
            <div key={x.t} className="glass-card p-6">
              <p className="text-sm font-semibold">{x.t}</p>
              <p className="mt-2 text-sm text-muted">{x.d}</p>
            </div>
          ))}
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

      <Section title="Centro informativo ciudadano" subtitle="Noticias y contexto cívico, con revisión humana.">
        <div className="glass-card p-6">
          <p className="text-sm text-muted">
            Aquí se publican notas breves con enfoque institucional. Cuando existe, se incluye enlace a la fuente. No se muestran métricas
            ni datos personales.
          </p>
          <div className="mt-4 flex flex-col gap-3 sm:flex-row">
            <Link className="inline-flex items-center justify-center rounded-full bg-amber-500 px-6 py-3 text-sm font-semibold text-slate-950 transition hover:bg-amber-400" href="/centro-informativo">
              Ir al centro informativo
            </Link>
            <Link className="glass-button" href="/about">
              Ver principios editoriales
            </Link>
            <Link className="glass-button" href="/admin/login">
              Admin login
            </Link>
          </div>
        </div>
      </Section>
    </div>
  );
}
