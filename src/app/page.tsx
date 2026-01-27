import Link from "next/link";
import { CandidateCard } from "@/components/CandidateCard";
import { PublicPageShell } from "@/components/PublicPageShell";
import { Section } from "@/components/Section";
import { getCandidates } from "@/lib/candidates/getCandidates";
import { TrackedExternalLink } from "@/components/analytics/TrackedExternalLink";
import { RotatingSeoMicrocopy } from "@/components/RotatingSeoMicrocopy";
import { Mp26EnterOnView } from "@/components/Mp26EnterOnView";

export default async function Home() {
  const candidates = await getCandidates();
  return (
    <PublicPageShell className="space-y-14 landing-animate">
      <Section>
        <div className="grid gap-8 lg:grid-cols-2 lg:items-center">
          <div className="space-y-5">
            <div className="inline-flex flex-wrap items-center gap-2">
              <span className="rounded-full border border-white/20 bg-white/12 px-3 py-1 text-xs font-medium text-foreground/95 backdrop-blur-xl">
                Colombia 2026
              </span>
              <span className="rounded-full border border-amber-300/30 bg-amber-300/14 px-3 py-1 text-xs font-medium text-amber-50">
                Información cívica
              </span>
            </div>

            <h1 className="text-balance text-4xl font-semibold tracking-tight md:text-5xl md:leading-[1.05]">
              Colombia decide mejor cuando hay{" "}
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-amber-300 via-amber-200 to-sky-200">
                seguridad
              </span>{" "}
              que se anticipa.
            </h1>

            <p className="text-pretty text-lg leading-relaxed text-muted">
              Infórmate con contexto territorial, propuestas oficiales e instituciones. Sin desinformación. Sin show. Sin presión.
            </p>

            <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap">
              <Link
                className="cta-primary"
                href="/centro-informativo"
              >
                Infórmate para decidir por Colombia <span aria-hidden>→</span>
              </Link>
              <Link
                className="inline-flex items-center justify-center rounded-full border border-white/20 bg-white/5 px-6 py-3 text-sm font-semibold text-foreground backdrop-blur-md transition hover:bg-white/10"
                href="/candidates"
              >
                Conoce a los candidatos
              </Link>
              <Link className="glass-button" href="/about">
                Principios editoriales
              </Link>
            </div>

            <p className="text-xs text-muted">
              Centro informativo ciudadano
            </p>
          </div>

          <div className="glass-hero relative overflow-hidden p-10">
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_18%_16%,rgba(250,204,21,.14),transparent_58%),radial-gradient(circle_at_82%_14%,rgba(56,189,248,.16),transparent_60%),radial-gradient(circle_at_78%_78%,rgba(34,197,94,.10),transparent_64%),radial-gradient(circle_at_26%_78%,rgba(239,68,68,.10),transparent_64%)]" />
            <div className="absolute inset-x-0 top-0 h-[2px] bg-gradient-to-r from-amber-200/60 via-white/40 to-sky-200/60" />
            <div className="relative flex items-start gap-5">
              <div className="mt-1 shrink-0">
                <span className="relative inline-flex h-12 w-12 items-center justify-center">
                  <span className="absolute -inset-6 rounded-full bg-sky-300/25 blur-2xl" />
                  <span
                    aria-hidden
                    className="relative h-12 w-12 rounded-2xl border border-white/25 bg-[linear-gradient(to_bottom,#facc15_0%,#facc15_52%,#2563eb_52%,#2563eb_76%,#ef4444_76%,#ef4444_100%)] soft-pulse shadow-[0_0_0_1px_rgba(255,255,255,.08)_inset,0_18px_50px_rgba(0,0,0,.22)]"
                  />
                </span>
              </div>
              <div className="space-y-2">
                <p className="text-sm font-semibold">Centro informativo ciudadano</p>
                <p className="text-sm leading-relaxed text-muted">
                  Actualidad, contexto y propuestas oficiales cuando existan. Publicación con revisión humana y trazabilidad.
                </p>
              </div>
            </div>

            <div className="relative mt-7 grid gap-3 sm:grid-cols-3">
              <div className="rounded-3xl border border-white/18 bg-white/10 p-5">
                <p className="text-sm font-semibold">Prevención</p>
                <p className="mt-1 text-xs text-muted">Acción temprana para reducir riesgos antes de que escalen.</p>
              </div>
              <div className="rounded-3xl border border-white/18 bg-white/10 p-5">
                <p className="text-sm font-semibold">Presencia</p>
                <p className="mt-1 text-xs text-muted">Cercanía institucional y control territorial con legalidad.</p>
              </div>
              <div className="rounded-3xl border border-white/18 bg-white/10 p-5">
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

      <Section title="Candidatos (Colombia, 2026)" subtitle="Perfiles públicos con biografía, propuesta y enlaces oficiales.">
        <Mp26EnterOnView className="grid gap-4 md:grid-cols-2" replayKey="home-candidates">
          {candidates.map((c, idx) => (
            <CandidateCard
              key={c.id}
              name={c.name}
              role={c.role}
              party={c.party}
              region={c.region}
              ballotNumber={c.ballotNumber}
              shortBio={c.shortBio}
              photoUrl={c.photoUrl}
              enterIndex={idx}
              href={`/candidates/${c.slug}`}
              proposalHref={`/candidates/${c.slug}#propuesta`}
            />
          ))}
        </Mp26EnterOnView>
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
              <TrackedExternalLink className="underline" candidateSlug="eduard-buitrago" href="https://x.com/yosoyeduardb">
                X · @yosoyeduardb
              </TrackedExternalLink>
              <TrackedExternalLink
                className="underline"
                candidateSlug="eduard-buitrago"
                href="https://www.instagram.com/soyeduardbuitrago?igsh=bnpsNmI2MGZ3azQy"
              >
                Instagram · @soyeduardbuitrago
              </TrackedExternalLink>
              <TrackedExternalLink className="underline" candidateSlug="eduard-buitrago" href="https://www.youtube.com/@soyeduardbuitrago7801">
                YouTube · @soyeduardbuitrago7801
              </TrackedExternalLink>
              <TrackedExternalLink className="underline" candidateSlug="eduard-buitrago" href="https://www.facebook.com/share/17x8kFiAGs/">
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
              Acceso interno
            </Link>
          </div>
          <div className="mt-4 rounded-2xl border border-white/14 bg-white/6 px-4 py-3 backdrop-blur">
            <RotatingSeoMicrocopy />
          </div>
        </div>
      </Section>
    </PublicPageShell>
  );
}
