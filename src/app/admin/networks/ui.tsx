"use client";

import { useEffect, useMemo, useState } from "react";

type Candidate = { id: string; name: string; office: string; region: string; ballot_number: number | null };
type Destination = {
  id: string;
  politician_id: string;
  network_name: string;
  network_type: string;
  profile_or_page_url: string;
  owner_name: string | null;
  owner_contact_phone: string | null;
  owner_contact_email: string | null;
  active: boolean;
  authorization_status: "pending" | "approved" | "expired" | "revoked";
  last_invite_sent_at: string | null;
  authorized_at: string | null;
  revoked_at: string | null;
};

type Stats = { total: number; approved: number; pending: number; expired: number };

type LoadState = "loading" | "ready" | "error";

const NETWORK_TYPES = ["official", "ally", "follower", "community", "media"] as const;

export function NetworksPanel() {
  const [loadState, setLoadState] = useState<LoadState>("loading");
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [destinations, setDestinations] = useState<Destination[]>([]);
  const [stats, setStats] = useState<Stats>({ total: 0, approved: 0, pending: 0, expired: 0 });
  const [msg, setMsg] = useState<string | null>(null);

  const [newFor, setNewFor] = useState<string>("");
  const [newName, setNewName] = useState("");
  const [newType, setNewType] = useState<(typeof NETWORK_TYPES)[number]>("official");
  const [newUrl, setNewUrl] = useState("");
  const [newOwner, setNewOwner] = useState("");
  const [newPhone, setNewPhone] = useState("");
  const [newEmail, setNewEmail] = useState("");

  const byCandidate = useMemo(() => {
    const map: Record<string, Destination[]> = {};
    for (const d of destinations) {
      if (!map[d.politician_id]) map[d.politician_id] = [];
      map[d.politician_id].push(d);
    }
    return map;
  }, [destinations]);

  async function refresh() {
    setMsg(null);
    setLoadState("loading");
    const r = await fetch("/api/admin/networks/list", { method: "GET" });
    const j = (await r.json().catch(() => null)) as any;
    if (!r.ok || !j?.ok) {
      setLoadState("error");
      return;
    }
    setCandidates(Array.isArray(j.candidates) ? j.candidates : []);
    setDestinations(Array.isArray(j.destinations) ? j.destinations : []);
    setStats(j.stats ?? { total: 0, approved: 0, pending: 0, expired: 0 });
    setLoadState("ready");
    if (!newFor && Array.isArray(j.candidates) && j.candidates.length) setNewFor(String(j.candidates[0].id));
  }

  useEffect(() => {
    void refresh();
    const t = setInterval(() => void refresh(), 45_000);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function addDestination() {
    setMsg(null);
    const payload = {
      politician_id: newFor,
      network_name: newName.trim(),
      network_type: newType,
      profile_or_page_url: newUrl.trim(),
      owner_name: newOwner.trim() ? newOwner.trim() : null,
      owner_contact_phone: newPhone.trim() ? newPhone.trim() : null,
      owner_contact_email: newEmail.trim() ? newEmail.trim() : null,
      active: true,
    };
    const r = await fetch("/api/admin/networks/destinations", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
    });
    const j = (await r.json().catch(() => null)) as any;
    if (!r.ok || !j?.ok) {
      setMsg("No fue posible agregar la red. Verifica URL y datos.");
      return;
    }
    setNewName("");
    setNewUrl("");
    setNewOwner("");
    setNewPhone("");
    setNewEmail("");
    await refresh();
  }

  async function toggleActive(d: Destination) {
    setMsg(null);
    const r = await fetch("/api/admin/networks/destinations", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ id: d.id, active: !d.active }),
    });
    if (!r.ok) {
      setMsg("No fue posible actualizar el estado.");
      return;
    }
    await refresh();
  }

  async function revoke(d: Destination) {
    setMsg(null);
    const ok = window.confirm("Vas a REVOCAR esta autorización. Esto desactiva la red. ¿Continuar?");
    if (!ok) return;
    const r = await fetch("/api/admin/networks/revoke", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ destination_id: d.id }),
    });
    if (!r.ok) {
      setMsg("No fue posible revocar.");
      return;
    }
    await refresh();
  }

  async function remove(d: Destination) {
    setMsg(null);
    const ok = window.confirm("Vas a ELIMINAR esta red/destino. ¿Continuar?");
    if (!ok) return;
    const r = await fetch("/api/admin/networks/destinations", {
      method: "DELETE",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ id: d.id }),
    });
    if (!r.ok) {
      setMsg("No fue posible eliminar.");
      return;
    }
    await refresh();
  }

  async function sendInvite(d: Destination) {
    setMsg(null);
    const r = await fetch("/api/admin/networks/invite", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ destination_id: d.id }),
    });
    const j = (await r.json().catch(() => null)) as any;
    if (!r.ok || !j?.ok) {
      setMsg("No fue posible generar el enlace. Verifica el WhatsApp (teléfono) del dueño.");
      return;
    }

    // Best UX: open WhatsApp deep-link in new tab. Admin sends without ver secretos.
    if (typeof j.whatsapp_url === "string" && j.whatsapp_url.startsWith("https://wa.me/")) {
      window.open(j.whatsapp_url, "_blank", "noopener,noreferrer");
    }
    await refresh();
    setMsg("Enlace generado. Se abrió WhatsApp para enviarlo al dueño (expira en 5 horas).");
  }

  function badge(status: Destination["authorization_status"]) {
    const cls =
      status === "approved"
        ? "text-emerald-300"
        : status === "pending"
          ? "text-amber-300"
          : status === "expired"
            ? "text-rose-300"
            : "text-muted";
    return <span className={cls}>{status}</span>;
  }

  return (
    <div className="space-y-8">
      <div className="glass-card p-6">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-base font-semibold">n8n / Redes</h2>
            <p className="mt-1 text-sm text-muted">
              Torre de control: aquí defines destinos y autorizaciones. La autorización se envía por WhatsApp con enlace temporal (5h).
            </p>
          </div>
          <button className="glass-button" type="button" onClick={refresh}>
            Actualizar
          </button>
        </div>

        <div className="mt-4 grid gap-3 sm:grid-cols-4">
          <div className="rounded-xl border border-border bg-background p-4">
            <p className="text-xs text-muted">Total redes</p>
            <p className="mt-1 text-lg font-semibold">{stats.total}</p>
          </div>
          <div className="rounded-xl border border-border bg-background p-4">
            <p className="text-xs text-muted">Aprobadas</p>
            <p className="mt-1 text-lg font-semibold text-emerald-300">{stats.approved}</p>
          </div>
          <div className="rounded-xl border border-border bg-background p-4">
            <p className="text-xs text-muted">Pendientes</p>
            <p className="mt-1 text-lg font-semibold text-amber-300">{stats.pending}</p>
          </div>
          <div className="rounded-xl border border-border bg-background p-4">
            <p className="text-xs text-muted">Expiradas</p>
            <p className="mt-1 text-lg font-semibold text-rose-300">{stats.expired}</p>
          </div>
        </div>

        {msg ? <p className="mt-4 text-sm text-amber-300">{msg}</p> : null}
      </div>

      <div className="glass-card p-6">
        <p className="text-sm font-semibold">Agregar destino social</p>
        <p className="mt-1 text-xs text-muted">
          El admin no maneja secretos. El dueño autoriza por WhatsApp (link expira en 5 horas). Nada se publica sin aprobación.
        </p>
        <div className="mt-4 grid gap-3 lg:grid-cols-2">
          <div className="grid gap-2">
            <label className="text-xs font-semibold text-muted">Candidato</label>
            <select className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm" value={newFor} onChange={(e) => setNewFor(e.target.value)}>
              {candidates.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name} · {c.office} · {c.region}
                </option>
              ))}
            </select>

            <label className="mt-2 text-xs font-semibold text-muted">Nombre de red (ej. Facebook Página)</label>
            <input className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm" value={newName} onChange={(e) => setNewName(e.target.value)} />

            <label className="mt-2 text-xs font-semibold text-muted">Tipo</label>
            <select className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm" value={newType} onChange={(e) => setNewType(e.target.value as any)}>
              {NETWORK_TYPES.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>

            <label className="mt-2 text-xs font-semibold text-muted">URL de perfil/página</label>
            <input className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm" value={newUrl} onChange={(e) => setNewUrl(e.target.value)} placeholder="https://..." />
          </div>

          <div className="grid gap-2">
            <label className="text-xs font-semibold text-muted">Dueño (nombre)</label>
            <input className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm" value={newOwner} onChange={(e) => setNewOwner(e.target.value)} />

            <label className="mt-2 text-xs font-semibold text-muted">WhatsApp del dueño</label>
            <input className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm" value={newPhone} onChange={(e) => setNewPhone(e.target.value)} placeholder="Ej: +57 300 123 4567" />

            <label className="mt-2 text-xs font-semibold text-muted">Email del dueño</label>
            <input className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm" value={newEmail} onChange={(e) => setNewEmail(e.target.value)} placeholder="opcional" />

            <button className="glass-button mt-3" type="button" onClick={addDestination} disabled={!newFor || !newName.trim() || !newUrl.trim()}>
              Guardar destino
            </button>
          </div>
        </div>
      </div>

      {loadState === "error" ? (
        <div className="glass-card p-6">
          <p className="text-sm text-amber-300">No se pudo cargar. Verifica migración y permisos.</p>
        </div>
      ) : null}

      <div className="space-y-5">
        {candidates.map((c) => {
          const rows = byCandidate[c.id] ?? [];
          return (
            <div key={c.id} className="glass-card p-6">
              <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="text-sm font-semibold">{c.name}</p>
                  <p className="text-xs text-muted">
                    {c.office} · {c.region}
                    {c.ballot_number ? ` · Tarjetón ${c.ballot_number}` : ""}
                  </p>
                </div>
                <p className="text-xs text-muted">Redes: {rows.length}</p>
              </div>

              {rows.length ? (
                <div className="mt-4 grid gap-3 md:grid-cols-2">
                  {rows.map((d) => (
                    <div key={d.id} className="rounded-2xl border border-border bg-background/60 p-4">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="text-sm font-semibold">{d.network_name}</p>
                          <p className="mt-1 text-xs text-muted">
                            {d.network_type} · {badge(d.authorization_status)} · {d.active ? <span className="text-emerald-300">active</span> : <span className="text-rose-300">inactive</span>}
                          </p>
                          <p className="mt-2 text-xs text-muted">
                            <a className="underline" href={d.profile_or_page_url} target="_blank" rel="noreferrer">
                              abrir perfil
                            </a>
                          </p>
                          <p className="mt-2 text-xs text-muted">
                            Dueño: {d.owner_name ?? "—"} · WhatsApp: {d.owner_contact_phone ?? "—"}
                          </p>
                          <p className="mt-1 text-xs text-muted">
                            Último invite: {d.last_invite_sent_at ? new Date(d.last_invite_sent_at).toLocaleString("es-CO") : "—"}
                          </p>
                        </div>
                      </div>

                      <div className="mt-3 flex flex-wrap gap-2">
                        <button className="glass-button" type="button" onClick={() => sendInvite(d)}>
                          Enviar enlace (WhatsApp)
                        </button>
                        <button className="glass-button" type="button" onClick={() => toggleActive(d)}>
                          {d.active ? "Desactivar" : "Activar"}
                        </button>
                        <button className="glass-button" type="button" onClick={() => revoke(d)}>
                          Revocar
                        </button>
                        <button className="glass-button" type="button" onClick={() => remove(d)}>
                          Eliminar
                        </button>
                      </div>

                      <div className="mt-3 rounded-xl border border-border bg-background p-3">
                        <p className="text-xs text-muted">
                          - La autorización se hace vía WhatsApp con enlace temporal (5h).<br />
                          - El dueño conserva control total (aprobar/rechazar).<br />
                          - No se publica nada sin aprobación explícita.
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="mt-4 text-sm text-muted">Sin destinos configurados.</p>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

