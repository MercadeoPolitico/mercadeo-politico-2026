"use client";

import { useEffect } from "react";
import { PublicPageShell } from "@/components/PublicPageShell";

export default function PoliticoError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  // No secrets; only show digest (Next-provided).
  useEffect(() => {
    // keep silent (production-safe)
    void error;
  }, [error]);

  return (
    <PublicPageShell className="mx-auto w-full max-w-lg space-y-3">
      <h1 className="text-2xl font-semibold tracking-tight">No fue posible abrir el portal</h1>
      <p className="text-sm text-muted">
        Ocurrió un error del sistema. Si el problema persiste, solicita un nuevo enlace al equipo de campaña.
      </p>
      {error?.digest ? <p className="text-xs text-muted">Digest: {error.digest}</p> : null}
      <div className="flex flex-wrap gap-2">
        <button className="glass-button" type="button" onClick={() => reset()}>
          Reintentar
        </button>
        <a className="glass-button" href="/politico/access">
          Volver a acceso
        </a>
      </div>
    </PublicPageShell>
  );
}
