"use client";

import { useState } from "react";

type Result =
  | { ok: true; email: string; tempPassword: string }
  | { ok: false; error: string };

export function AdminUsersClient() {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<Result | null>(null);

  async function onCreate(e: React.FormEvent) {
    e.preventDefault();
    setResult(null);
    setLoading(true);

    const resp = await fetch("/api/admin/users", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email }),
    });

    setLoading(false);

    if (!resp.ok) {
      const data = (await resp.json().catch(() => null)) as { error?: unknown } | null;
      setResult({ ok: false, error: typeof data?.error === "string" ? data.error : "request_failed" });
      return;
    }

    const data = (await resp.json()) as { ok?: unknown; email?: unknown; tempPassword?: unknown };
    if (data.ok !== true || typeof data.email !== "string" || typeof data.tempPassword !== "string") {
      setResult({ ok: false, error: "invalid_response" });
      return;
    }

    setEmail("");
    setResult({ ok: true, email: data.email, tempPassword: data.tempPassword });
  }

  return (
    <div className="space-y-8">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">Usuarios admin</h1>
        <p className="text-sm text-muted">Crea usuarios con contraseña temporal (deben cambiarla al primer ingreso).</p>
      </header>

      <form onSubmit={onCreate} className="glass-card space-y-4 p-6">
        <div className="space-y-1">
          <label className="text-sm font-medium" htmlFor="email">
            Email del nuevo admin
          </label>
          <input
            id="email"
            className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
        </div>

        <button className="glass-button" type="submit" disabled={loading}>
          {loading ? "Creando…" : "Crear admin"}
        </button>

        {result?.ok === false ? (
          <p className="text-sm text-amber-300">No fue posible crear el usuario ({result.error}).</p>
        ) : null}

        {result?.ok === true ? (
          <div className="rounded-xl border border-border bg-background/50 p-4">
            <p className="text-sm font-semibold">Admin creado</p>
            <p className="mt-1 text-sm text-muted">
              Email: <span className="text-foreground">{result.email}</span>
            </p>
            <p className="mt-1 text-sm text-muted">Contraseña temporal (cópiala y guárdala ahora):</p>
            <div className="mt-2 rounded-lg border border-border bg-background px-3 py-2 font-mono text-sm">
              {result.tempPassword}
            </div>
          </div>
        ) : null}
      </form>
    </div>
  );
}

