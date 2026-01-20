"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";

type EnvDiag = {
  NEXT_PUBLIC_SUPABASE_URL: boolean;
  NEXT_PUBLIC_SUPABASE_ANON_KEY: boolean;
  SUPABASE_SERVICE_ROLE_KEY: boolean;
};

export function ForcePasswordChangeClient() {
  const router = useRouter();
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);

  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [envDiag, setEnvDiag] = useState<EnvDiag | null>(null);

  useEffect(() => {
    if (supabase) return;
    let cancelled = false;
    fetch("/api/health/supabase", { method: "GET", cache: "no-store" })
      .then(async (r) => (r.ok ? ((await r.json()) as { env?: EnvDiag }) : null))
      .then((j) => {
        if (!cancelled && j?.env) setEnvDiag(j.env);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [supabase]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (!supabase) {
      setError("Supabase no está configurado en este entorno.");
      return;
    }

    if (password.length < 12) {
      setError("Usa una contraseña de al menos 12 caracteres.");
      return;
    }
    if (password !== confirm) {
      setError("Las contraseñas no coinciden.");
      return;
    }

    setLoading(true);
    const { error: updateErr } = await supabase.auth.updateUser({ password });
    if (updateErr) {
      setLoading(false);
      setError("No fue posible actualizar la contraseña.");
      return;
    }

    // Clear the server-enforced flag (app_metadata) using a server route
    const resp = await fetch("/api/admin/clear-must-change", { method: "POST" });
    setLoading(false);

    if (!resp.ok) {
      setError("La contraseña se actualizó, pero faltó finalizar la activación. Intenta nuevamente.");
      return;
    }

    router.replace("/admin");
  }

  return (
    <div className="mx-auto w-full max-w-md space-y-6">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">Actualiza tu contraseña</h1>
        <p className="text-sm text-muted">Por seguridad, debes cambiar la contraseña temporal antes de continuar.</p>
      </header>

      <form onSubmit={onSubmit} className="glass-card space-y-4 p-6">
        {!supabase ? (
          <div className="rounded-2xl border border-amber-400/30 bg-amber-500/10 p-4 text-sm text-amber-100">
            <p className="font-semibold">Supabase no está configurado en este entorno.</p>
            {envDiag ? (
              <ul className="mt-3 space-y-1 text-xs">
                <li>
                  NEXT_PUBLIC_SUPABASE_URL: <strong>{envDiag.NEXT_PUBLIC_SUPABASE_URL ? "OK" : "FALTA"}</strong>
                </li>
                <li>
                  NEXT_PUBLIC_SUPABASE_ANON_KEY: <strong>{envDiag.NEXT_PUBLIC_SUPABASE_ANON_KEY ? "OK" : "FALTA"}</strong>
                </li>
              </ul>
            ) : null}
          </div>
        ) : null}

        <div className="space-y-1">
          <label className="text-sm font-medium" htmlFor="password">
            Nueva contraseña
          </label>
          <input
            id="password"
            className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm"
            type="password"
            autoComplete="new-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
          <p className="text-xs text-muted">Recomendación: 16+ caracteres, mezcla de letras, números y símbolos.</p>
        </div>

        <div className="space-y-1">
          <label className="text-sm font-medium" htmlFor="confirm">
            Confirmar contraseña
          </label>
          <input
            id="confirm"
            className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm"
            type="password"
            autoComplete="new-password"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            required
          />
        </div>

        {error ? <p className="text-sm text-amber-300">{error}</p> : null}

        <button className="glass-button w-full" type="submit" disabled={loading}>
          {loading ? "Guardando…" : "Guardar y continuar"}
        </button>
      </form>
    </div>
  );
}

