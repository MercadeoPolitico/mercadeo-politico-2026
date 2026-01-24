"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";

type EnvDiag = {
  NEXT_PUBLIC_SUPABASE_URL: boolean;
  NEXT_PUBLIC_SUPABASE_ANON_KEY: boolean;
  SUPABASE_SERVICE_ROLE_KEY: boolean;
};

export function ForcePasswordChangeClient() {
  const router = useRouter();
  const search = useSearchParams();

  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [envDiag, setEnvDiag] = useState<EnvDiag | null>(null);
  const [recoveryReady, setRecoveryReady] = useState(false);
  const [recoveryChecked, setRecoveryChecked] = useState(false);

  useEffect(() => {
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
  }, []);

  // Password recovery flow (email link): exchange code for session in the browser.
  // This allows updating the password even if SSR cookies are not present yet.
  useEffect(() => {
    let cancelled = false;

    async function run() {
      try {
        const code = search.get("code");
        if (!code) {
          if (!cancelled) setRecoveryChecked(true);
          return;
        }

        const supabase = createSupabaseBrowserClient();
        const { error } = await supabase.auth.exchangeCodeForSession(code);
        if (!cancelled) {
          setRecoveryReady(!error);
          setRecoveryChecked(true);
          if (error) setError("El enlace de recuperación no es válido o expiró. Solicita uno nuevo desde el login.");
        }
      } catch {
        if (!cancelled) {
          setRecoveryReady(false);
          setRecoveryChecked(true);
        }
      }
    }

    void run();
    return () => {
      cancelled = true;
    };
  }, [search]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (password.length < 12) {
      setError("Usa una contraseña de al menos 12 caracteres.");
      return;
    }
    if (password !== confirm) {
      setError("Las contraseñas no coinciden.");
      return;
    }

    setLoading(true);

    // If this page was reached via recovery email link (has ?code=...), update password in browser session.
    if (recoveryChecked && recoveryReady) {
      try {
        const supabase = createSupabaseBrowserClient();
        const { error } = await supabase.auth.updateUser({ password });
        setLoading(false);
        if (error) {
          setError("No fue posible actualizar la contraseña (recovery). Intenta solicitar un nuevo enlace.");
          return;
        }
        // After recovery password update, user should login again to establish SSR cookies for admin middleware.
        router.replace("/admin/login?reason=must_change_password");
        return;
      } catch {
        setLoading(false);
        setError("No fue posible actualizar la contraseña (recovery).");
        return;
      }
    }

    // Default flow: user already has SSR session (forced password change after admin reset).
    const updateResp = await fetch("/api/auth/update-password", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ password }),
    });
    if (!updateResp.ok) {
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
        {envDiag && (!envDiag.NEXT_PUBLIC_SUPABASE_URL || !envDiag.NEXT_PUBLIC_SUPABASE_ANON_KEY) ? (
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

