"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";

type EnvDiag = {
  NEXT_PUBLIC_SUPABASE_URL: boolean;
  NEXT_PUBLIC_SUPABASE_ANON_KEY: boolean;
  SUPABASE_SERVICE_ROLE_KEY: boolean;
};

export function AdminLoginClient() {
  const router = useRouter();
  const search = useSearchParams();
  const next = search.get("next") ?? "/admin";

  const supabase = useMemo(() => createSupabaseBrowserClient(), []);

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [envDiag, setEnvDiag] = useState<EnvDiag | null>(null);

  useEffect(() => {
    // If the browser client isn't configured, fetch a server-side boolean diag (no secrets).
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

    setLoading(true);
    const { error: err } = await supabase.auth.signInWithPassword({ email, password });
    setLoading(false);

    if (err) {
      setError("No fue posible iniciar sesión. Verifica tus credenciales.");
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
        {!supabase ? (
          <div className="rounded-2xl border border-amber-400/30 bg-amber-500/10 p-4 text-sm text-amber-100">
            <p className="font-semibold">Supabase no está configurado en este entorno.</p>
            <p className="mt-2 text-xs opacity-90">
              En Vercel, confirma variables en <strong>Production</strong> y haz{" "}
              <strong>Redeploy (Clear build cache)</strong>. En local, revisa <code>.env.local</code> y reinicia{" "}
              <code>npm run dev</code>.
            </p>
            {envDiag ? (
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
            ) : null}
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

