export function SiteFooter() {
  return (
    <footer className="border-t border-border bg-background">
      <div className="mx-auto w-full max-w-6xl px-4 py-8">
        <p className="text-sm text-muted">
          Plataforma de comunicación política digital para Colombia 2026. Compromiso con transparencia, educación
          cívica y cumplimiento legal. Este sitio no promueve desinformación ni tácticas engañosas.
        </p>
        <p className="mt-3 text-xs text-muted">
          © {new Date().getFullYear()} mercadeo-politico-2026 — Meta, Colombia.
        </p>
      </div>
    </footer>
  );
}

