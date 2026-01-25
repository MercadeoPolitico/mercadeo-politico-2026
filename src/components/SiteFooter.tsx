import Link from "next/link";
import Image from "next/image";

export function SiteFooter() {
  return (
    <footer className="border-t border-white/10 bg-[radial-gradient(circle_at_14%_10%,rgba(56,189,248,.10),transparent_56%),radial-gradient(circle_at_80%_18%,rgba(34,197,94,.08),transparent_58%),radial-gradient(circle_at_60%_110%,rgba(255,255,255,.06),transparent_52%)]">
      <div className="mx-auto w-full max-w-6xl px-4 py-10">
        <div className="rounded-3xl border border-white/14 bg-white/6 p-6 backdrop-blur-xl">
          <p className="text-sm leading-relaxed text-foreground/80">
          Plataforma de comunicación política digital para Colombia 2026. Compromiso con transparencia, educación
          cívica y cumplimiento legal. Este sitio no promueve desinformación ni tácticas engañosas.
        </p>

          <div className="mt-5 flex flex-wrap gap-2 text-sm">
            <Link className="rounded-full px-3 py-2 text-foreground/70 transition hover:bg-white/8 hover:text-foreground" href="/centro-informativo">
            Centro informativo
          </Link>
            <Link className="rounded-full px-3 py-2 text-foreground/70 transition hover:bg-white/8 hover:text-foreground" href="/candidates">
            Candidatos
          </Link>
            <Link className="rounded-full px-3 py-2 text-foreground/70 transition hover:bg-white/8 hover:text-foreground" href="/about">
            Principios
          </Link>
        </div>

          <div className="mt-6 flex flex-col gap-3 border-t border-white/12 pt-6 sm:flex-row sm:items-center sm:justify-between">
          <a
            className="inline-flex items-center gap-3 rounded-2xl border border-white/14 bg-white/7 px-4 py-3 text-xs text-foreground/75 hover:bg-white/10"
            href="https://marketbrain.tech/landing"
            target="_blank"
            rel="noreferrer"
            aria-label="Marketbrain Technology (abrir en una nueva pestaña)"
          >
            <span className="relative inline-flex h-12 w-12 shrink-0 items-center justify-center">
              <span className="absolute inset-0 rounded-full bg-sky-200/25 blur-xl" />
              <span className="absolute inset-0 rounded-full bg-emerald-300/20 blur-2xl" />
              <span className="absolute inset-0 rounded-full bg-white/10 blur-2xl" />
              <Image
                alt="Marketbrain Technology — sello"
                src="/icons/marketbrain-seal.png"
                width={48}
                height={48}
                className="relative h-12 w-12 rounded-full border border-white/18 bg-black/10 object-cover marketbrain-seal-glow"
              />
            </span>
            <span className="leading-snug">
              <span className="font-semibold text-foreground">Powered by Marketbrain Technology™</span>
              <span className="mx-2 text-foreground/40">·</span>
              <span>by Marleny AI Holdings LLC (Wyoming, USA)</span>
              <span className="mx-2 text-foreground/40">·</span>
              <span>Marleny Synthetic Intelligence</span>
              <span className="mx-2 text-foreground/40">·</span>
              <span>By JCG · US Army Veteran</span>
            </span>
          </a>
        </div>

          <p className="mt-4 text-xs text-foreground/65">
            © {new Date().getFullYear()} mercadeo-politico-2026 — Meta, Colombia.
          </p>
        </div>
      </div>
    </footer>
  );
}

