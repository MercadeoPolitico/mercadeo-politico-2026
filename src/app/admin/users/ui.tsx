"use client";

import { useEffect, useState } from "react";

type Result =
  | { ok: true; email: string; tempPassword: string }
  | { ok: false; error: string };

type AdminUserRow = {
  id: string;
  email: string | null;
  role: "admin" | "super_admin" | null;
  must_change_password: boolean;
  disabled: boolean;
  created_at: string | null;
  last_sign_in_at: string | null;
};

export function AdminUsersClient() {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<Result | null>(null);

  const [users, setUsers] = useState<AdminUserRow[]>([]);
  const [usersLoading, setUsersLoading] = useState(false);
  const [usersMsg, setUsersMsg] = useState<string | null>(null);

  async function refreshUsers() {
    setUsersMsg(null);
    setUsersLoading(true);
    const resp = await fetch("/api/admin/users", { method: "GET" });
    setUsersLoading(false);
    if (!resp.ok) {
      setUsersMsg("No fue posible cargar usuarios.");
      return;
    }
    const data = (await resp.json()) as { ok?: unknown; users?: unknown };
    if (data.ok !== true || !Array.isArray(data.users)) {
      setUsersMsg("Respuesta inválida.");
      return;
    }
    setUsers(data.users as AdminUserRow[]);
  }

  useEffect(() => {
    void refreshUsers();
  }, []);

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
    await refreshUsers();
  }

  async function resetPassword(userId: string) {
    const resp = await fetch("/api/admin/users", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action: "reset_password", user_id: userId }),
    });
    if (!resp.ok) {
      alert("No fue posible resetear la contraseña.");
      return;
    }
    const data = (await resp.json()) as { ok?: unknown; tempPassword?: unknown };
    if (data.ok === true && typeof data.tempPassword === "string") {
      alert(`Contraseña temporal (cópiala ahora): ${data.tempPassword}`);
      await refreshUsers();
      return;
    }
    alert("Respuesta inválida.");
  }

  async function toggleDisabled(u: AdminUserRow) {
    const next = !u.disabled;
    const resp = await fetch("/api/admin/users", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action: "set_disabled", user_id: u.id, disabled: next }),
    });
    if (!resp.ok) {
      alert("No fue posible actualizar el estado.");
      return;
    }
    await refreshUsers();
  }

  async function setRole(userId: string, role: "admin" | "super_admin") {
    const resp = await fetch("/api/admin/users", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action: "set_role", user_id: userId, role }),
    });
    if (!resp.ok) {
      const j = (await resp.json().catch(() => null)) as { error?: unknown } | null;
      alert(typeof j?.error === "string" ? j.error : "No fue posible actualizar el rol.");
      return;
    }
    await refreshUsers();
  }

  return (
    <div className="space-y-8">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">Usuarios admin</h1>
        <p className="text-sm text-muted">Crea usuarios con contraseña temporal (deben cambiarla al primer ingreso).</p>
      </header>

      <div className="glass-card space-y-4 p-6">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="text-base font-semibold">Usuarios</h2>
            <p className="text-sm text-muted">Listado de Auth + rol en `profiles` + estado (disabled).</p>
          </div>
          <button className="glass-button" type="button" onClick={() => void refreshUsers()} disabled={usersLoading}>
            {usersLoading ? "Cargando…" : "Actualizar"}
          </button>
        </div>
        {usersMsg ? <p className="text-sm text-amber-300">{usersMsg}</p> : null}
        <div className="mt-2 grid gap-3">
          {users.map((u) => (
            <div key={u.id} className="rounded-2xl border border-border bg-background/50 p-4">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold">{u.email ?? u.id}</p>
                  <p className="mt-1 text-xs text-muted">
                    Role: <span className="text-foreground">{u.role ?? "—"}</span> · Estado:{" "}
                    <span className="text-foreground">{u.disabled ? "desactivado" : "activo"}</span>
                    {u.must_change_password ? <span className="text-amber-200"> · must_change_password</span> : null}
                  </p>
                  <p className="mt-1 text-xs text-muted">
                    Creado: {u.created_at ? new Date(u.created_at).toLocaleString("es-CO") : "—"} · Último ingreso:{" "}
                    {u.last_sign_in_at ? new Date(u.last_sign_in_at).toLocaleString("es-CO") : "—"}
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <button className="glass-button" type="button" onClick={() => void resetPassword(u.id)}>
                    Reset password
                  </button>
                  <button className="glass-button" type="button" onClick={() => void toggleDisabled(u)}>
                    {u.disabled ? "Activar" : "Desactivar"}
                  </button>
                </div>
              </div>

              <div className="mt-3 flex flex-wrap items-center gap-2">
                <label className="text-xs text-muted">Rol</label>
                <select
                  className="rounded-xl border border-border bg-background px-3 py-2 text-sm"
                  value={u.role ?? "admin"}
                  onChange={(e) => void setRole(u.id, e.target.value === "super_admin" ? "super_admin" : "admin")}
                >
                  <option value="admin">admin</option>
                  <option value="super_admin">super_admin</option>
                </select>
                <p className="text-xs text-muted">Cambios de rol aplican inmediatamente.</p>
              </div>
            </div>
          ))}
          {users.length === 0 ? <p className="text-sm text-muted">No hay usuarios listados aún.</p> : null}
        </div>
      </div>

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

