"use client";

import { useState } from "react";

type State =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "done"; version: string }
  | { status: "error" };

export function CacheResetCard() {
  const [state, setState] = useState<State>({ status: "idle" });

  async function run() {
    const ok = window.confirm(
      "Esto publicará un 'cache reset' global.\n\n" +
        "- En el próximo ingreso de cada usuario, el sitio borrará Cache Storage + Storage (PWA/cliente) y recargará.\n" +
        "- NO borra cookies (no debería cerrar sesiones), pero puede reiniciar estados locales.\n\n" +
        "¿Deseas continuar?"
    );
    if (!ok) return;

    setState({ status: "loading" });
    const res = await fetch("/api/admin/cache-bust", { method: "POST" });
    if (!res.ok) {
      setState({ status: "error" });
      return;
    }
    const json = (await res.json().catch(() => null)) as { ok?: unknown; version?: unknown } | null;
    const v = typeof json?.version === "string" ? json.version : "";
    if (!v) {
      setState({ status: "error" });
      return;
    }
    setState({ status: "done", version: v });
  }

  return (
    <div className="glass-card border border-emerald-300/40 bg-emerald-400/10 p-6">
      <p className="text-sm font-semibold text-emerald-100">Reset de caché (usuarios)</p>
      <p className="mt-2 text-sm text-emerald-100/80">
        Útil cuando ves que usuarios siguen viendo una versión vieja del sitio. Esto incrementa una versión global y, en el próximo ingreso,
        el navegador borrará caché/almacenamiento del sitio y recargará automáticamente.
      </p>
      <div className="mt-4 flex flex-wrap items-center gap-3">
        <button
          className="glass-button border-emerald-300/50 bg-emerald-500/20 text-emerald-100"
          type="button"
          onClick={run}
          disabled={state.status === "loading"}
        >
          {state.status === "loading" ? "Aplicando…" : "Resetear caché ahora"}
        </button>
        {state.status === "done" ? <span className="text-xs text-emerald-100/80">Versión: {state.version}</span> : null}
        {state.status === "error" ? <span className="text-xs text-amber-200">No fue posible aplicar el reset.</span> : null}
      </div>
    </div>
  );
}

