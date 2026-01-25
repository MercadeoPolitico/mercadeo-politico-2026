import Link from "next/link";
import Image from "next/image";

export function SiteFooter() {
  return (
    <footer className="border-t border-border bg-background">
      <div className="mx-auto w-full max-w-6xl px-4 py-8">
        <p className="text-sm text-muted">
          Plataforma de comunicación política digital para Colombia 2026. Compromiso con transparencia, educación
          cívica y cumplimiento legal. Este sitio no promueve desinformación ni tácticas engañosas.
        </p>

        <div className="mt-4 flex flex-wrap gap-2 text-sm">
          <Link className="rounded-full px-3 py-2 text-muted transition hover:bg-white/5 hover:text-foreground" href="/centro-informativo">
            Centro informativo
          </Link>
          <Link className="rounded-full px-3 py-2 text-muted transition hover:bg-white/5 hover:text-foreground" href="/candidates">
            Candidatos
          </Link>
          <Link className="rounded-full px-3 py-2 text-muted transition hover:bg-white/5 hover:text-foreground" href="/about">
            Principios
          </Link>
        </div>

        <div className="mt-5 flex flex-col gap-3 border-t border-border/60 pt-5 sm:flex-row sm:items-center sm:justify-between">
          <a
            className="inline-flex items-center gap-3 rounded-xl border border-border/60 bg-surface/50 px-3 py-2 text-xs text-muted hover:bg-surface"
            href="https://marketbrain.tech/landing"
            target="_blank"
            rel="noreferrer"
            aria-label="Marketbrain Technology (abrir en una nueva pestaña)"
          >
            <span className="relative inline-flex h-9 w-9 shrink-0 items-center justify-center">
              <span className="absolute inset-0 rounded-full bg-sky-300/25 blur-xl" />
              <span className="absolute inset-0 rounded-full bg-amber-300/20 blur-2xl" />
              <Image
                alt="Marketbrain Technology — sello"
                src="/icons/marketbrain-seal.png"
                width={36}
                height={36}
                className="relative h-9 w-9 rounded-full border border-white/18 bg-black/10 object-cover marketbrain-seal-glow"
              />
            </span>
            <span className="leading-snug">
              <span className="font-semibold text-foreground">Powered by Marketbrain Technology™</span>
              <span className="mx-2 text-muted">·</span>
              <span>by Marleny AI Holdings LLC (Wyoming, USA)</span>
              <span className="mx-2 text-muted">·</span>
              <span>Marleny Synthetic Intelligence</span>
              <span className="mx-2 text-muted">·</span>
              <span>By JCG · US Army Veteran</span>
            </span>
          </a>
        </div>

        <p className="mt-3 text-xs text-muted">
          © {new Date().getFullYear()} mercadeo-politico-2026 — Meta, Colombia.
        </p>
      </div>
    </footer>
  );
}

