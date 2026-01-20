"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

type EnvDiag = {
  NEXT_PUBLIC_SUPABASE_URL: boolean;
  NEXT_PUBLIC_SUPABASE_ANON_KEY: boolean;
  SUPABASE_SERVICE_ROLE_KEY: boolean;
};

export function AdminLoginClient() {
  const router = useRouter();
  const search = useSearchParams();
  const next = search.get("next") ?? "/admin";
  const pageReason = search.get("reason");

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [envDiag, setEnvDiag] = useState<EnvDiag | null>(null);
  const [runtimeProjectRef, setRuntimeProjectRef] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/health/supabase", { method: "GET", cache: "no-store" })
      .then(async (r) => (r.ok ? ((await r.json()) as { env?: EnvDiag; runtime?: { supabase_project_ref?: string | null } }) : null))
      .then((j) => {
        if (cancelled) return;
        if (j?.env) setEnvDiag(j.env);
        const ref = j?.runtime?.supabase_project_ref;
        if (typeof ref === "string" || ref === null) setRuntimeProjectRef(ref ?? null);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    setLoading(true);
    const resp = await fetch("/api/auth/login", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email, password }),
    });
    setLoading(false);

    if (!resp.ok) {
      let errorCode: string | null = null;
      let reason: string | null = null;
      try {
        const j = (await resp.json()) as { error?: string; reason?: string };
        if (typeof j?.error === "string") errorCode = j.error;
        if (typeof j?.reason === "string") reason = j.reason;
      } catch {
        // ignore (non-json upstream)
      }

      if (errorCode === "supabase_not_configured") {
        setError("Supabase no está configurado en este entorno (server). Revisa NEXT_PUBLIC_SUPABASE_URL y ANON en Production y redeploy.");
      } else if (reason === "invalid_api_key") {
        setError("Falla de configuración: el ANON KEY en Vercel no corresponde a este proyecto (anon key inválido).");
      } else if (reason === "email_not_confirmed") {
        setError("El usuario existe pero el email no está confirmado en Supabase Auth.");
      } else if (reason === "rate_limited") {
        setError("Demasiados intentos. Espera un momento y vuelve a intentar.");
      } else if (reason === "invalid_credentials") {
        setError("Credenciales inválidas (email/contraseña). Si acabas de resetear, vuelve a ejecutar el reset para ESTE email.");
      } else if (reason) {
        setError(`No fue posible iniciar sesión. (reason: ${reason})`);
      } else if (errorCode) {
        setError(`No fue posible iniciar sesión. (error: ${errorCode})`);
      } else {
        setError("No fue posible iniciar sesión. Verifica tus credenciales.");
      }
      return;
    }

    router.replace(next);
  }

  return (
    <div className="mx-auto w-full max-w-md space-y-6">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">Ingreso admin</h1>
        <p className="text-sm text-muted">Acceso interno. Requiere rol admin o super_admin.</p>
      </header>

      <form onSubmit={onSubmit} className="glass-card space-y-4 p-6">
        {pageReason === "forbidden" ? (
          <div className="rounded-2xl border border-amber-400/30 bg-amber-500/10 p-4 text-sm text-amber-100">
            <p className="font-semibold">No tienes rol admin o super_admin.</p>
            <p className="mt-2 text-xs opacity-90">Tu usuario inició sesión, pero en `profiles.role` no es admin/super_admin.</p>
          </div>
        ) : pageReason === "unauthorized" ? (
          <div className="rounded-2xl border border-border/60 bg-white/5 p-4 text-sm text-muted">
            Sesión no detectada. Inicia sesión para continuar.
          </div>
        ) : null}

        {envDiag && (!envDiag.NEXT_PUBLIC_SUPABASE_URL || !envDiag.NEXT_PUBLIC_SUPABASE_ANON_KEY) ? (
          <div className="rounded-2xl border border-amber-400/30 bg-amber-500/10 p-4 text-sm text-amber-100">
            <p className="font-semibold">Supabase no está configurado en este entorno.</p>
            <p className="mt-2 text-xs opacity-90">
              En Vercel, confirma variables en <strong>Production</strong> y haz{" "}
              <strong>Redeploy (Clear build cache)</strong>. En local, revisa <code>.env.local</code> y reinicia{" "}
              <code>npm run dev</code>.
            </p>
            <ul className="mt-3 space-y-1 text-xs">
              <li>
                NEXT_PUBLIC_SUPABASE_URL: <strong>{envDiag.NEXT_PUBLIC_SUPABASE_URL ? "OK" : "FALTA"}</strong>
              </li>
              <li>
                NEXT_PUBLIC_SUPABASE_ANON_KEY: <strong>{envDiag.NEXT_PUBLIC_SUPABASE_ANON_KEY ? "OK" : "FALTA"}</strong>
              </li>
              <li>
                SUPABASE_SERVICE_ROLE_KEY: <strong>{envDiag.SUPABASE_SERVICE_ROLE_KEY ? "OK" : "FALTA"}</strong>
              </li>
            </ul>
          </div>
        ) : null}

        {runtimeProjectRef ? (
          <div className="rounded-2xl border border-border/60 bg-white/5 p-4 text-xs text-muted">
            Runtime Supabase project: <strong className="text-foreground">{runtimeProjectRef}</strong>
          </div>
        ) : null}

        <div className="space-y-1">
          <label className="text-sm font-medium" htmlFor="email">
            Email
          </label>
          <input
            id="email"
            className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm"
            type="email"
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
        </div>

        <div className="space-y-1">
          <label className="text-sm font-medium" htmlFor="password">
            Contraseña
          </label>
          <input
            id="password"
            className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm"
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
        </div>

        {error ? <p className="text-sm text-amber-300">{error}</p> : null}

        <button className="glass-button w-full" type="submit" disabled={loading}>
          {loading ? "Ingresando…" : "Ingresar"}
        </button>
      </form>
    </div>
  );
}

