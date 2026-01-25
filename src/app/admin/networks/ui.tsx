"use client";

import { useEffect, useMemo, useState } from "react";

type Candidate = { id: string; name: string; office: string; region: string; ballot_number: number | null };
type Destination = {
  id: string;
  politician_id: string;
  network_name: string;
  network_key?: string | null;
  scope?: "page" | "profile" | "channel" | string | null;
  target_id?: string | null;
  network_type: string;
  profile_or_page_url: string;
  owner_name: string | null;
  owner_contact_phone: string | null;
  owner_contact_email: string | null;
  authorized_by_name?: string | null;
  authorized_by_phone?: string | null;
  authorized_by_email?: string | null;
  active: boolean;
  authorization_status: "pending" | "approved" | "expired" | "revoked";
  last_invite_sent_at: string | null;
  authorized_at: string | null;
  revoked_at: string | null;
};

type Stats = { total: number; approved: number; pending: number; expired: number };
type HealthStatus = "ok" | "warn" | "down" | null;
type RssSource = {
  id: string;
  name: string;
  region_key: "meta" | "colombia" | "otra";
  base_url: string;
  rss_url: string;
  active: boolean;
  updated_at: string;
  last_health_status?: HealthStatus;
  last_health_checked_at?: string | null;
  last_health_ms?: number | null;
  last_item_count?: number | null;
};

type LoadState = "loading" | "ready" | "error";

const NETWORK_TYPES = ["official", "ally", "follower", "community", "media"] as const;
const NETWORK_KEYS = ["facebook", "instagram", "threads", "x", "telegram", "reddit"] as const;
type NetworkKey = (typeof NETWORK_KEYS)[number];
const SCOPES = ["profile", "page", "channel"] as const;
type Scope = (typeof SCOPES)[number];

const OAUTH_PROVIDERS = [
  { key: "meta", label: "Meta (Facebook/Instagram)" },
  { key: "x", label: "X (Twitter)" },
  { key: "reddit", label: "Reddit" },
] as const;
type OAuthProviderKey = (typeof OAUTH_PROVIDERS)[number]["key"];
type OAuthProviderOption = (typeof OAUTH_PROVIDERS)[number];

function guessNetworkKey(name: string, url: string): NetworkKey | "" {
  const hay = `${name} ${url}`.toLowerCase();
  if (hay.includes("facebook") || hay.includes("fb.com") || hay.includes("facebook.com")) return "facebook";
  if (hay.includes("instagram") || hay.includes("instagr.am") || hay.includes("instagram.com")) return "instagram";
  if (hay.includes("threads") || hay.includes("threads.net")) return "threads";
  if (hay.includes("twitter") || hay.includes("x.com") || hay.includes("t.co")) return "x";
  if (hay.includes("telegram") || hay.includes("t.me")) return "telegram";
  if (hay.includes("reddit") || hay.includes("reddit.com")) return "reddit";
  return "";
}

function defaultScopeFor(nk: string): Scope {
  if (nk === "telegram") return "channel";
  if (nk === "facebook") return "page";
  return "profile";
}

export function NetworksPanel() {
  const [loadState, setLoadState] = useState<LoadState>("loading");
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [destinations, setDestinations] = useState<Destination[]>([]);
  const [stats, setStats] = useState<Stats>({ total: 0, approved: 0, pending: 0, expired: 0 });
  const [msg, setMsg] = useState<string | null>(null);
  const [rssSources, setRssSources] = useState<RssSource[]>([]);
  const [inviteInfo, setInviteInfo] = useState<Record<string, { invite_url: string; expires_at: string }>>({});
  const [rssForm, setRssForm] = useState<{ name: string; region_key: RssSource["region_key"]; rss_url: string; active: boolean }>({
    name: "",
    region_key: "meta",
    rss_url: "",
    active: true,
  });

  const [newFor, setNewFor] = useState<string>("");
  const [newName, setNewName] = useState("");
  const [newKey, setNewKey] = useState<NetworkKey | "">("");
  const [newScope, setNewScope] = useState<Scope>("profile");
  const [newTargetId, setNewTargetId] = useState("");
  const [newType, setNewType] = useState<(typeof NETWORK_TYPES)[number]>("official");
  const [newUrl, setNewUrl] = useState("");
  const [newOwner, setNewOwner] = useState("");
  const [newPhone, setNewPhone] = useState("");
  const [newEmail, setNewEmail] = useState("");
  const [routing, setRouting] = useState<Record<string, { network_key: NetworkKey | ""; scope: Scope; target_id: string }>>({});

  const [oauthProvider, setOauthProvider] = useState<OAuthProviderKey>("meta");
  const [oauthCandidateId, setOauthCandidateId] = useState<string>("");
  const [oauthLink, setOauthLink] = useState<string>("");
  const [oauthStatus, setOauthStatus] = useState<{ loaded: boolean; providers?: any; has_encryption_key?: boolean; counts?: any }>({ loaded: false });

  const oauthProvidersAvailable = useMemo<OAuthProviderOption[]>(() => {
    const providers = oauthStatus.providers ?? {};
    const encOk = oauthStatus.has_encryption_key === true;
    if (!encOk) return [];
    return OAUTH_PROVIDERS.filter((p) => providers?.[p.key]?.configured === true);
  }, [oauthStatus.has_encryption_key, oauthStatus.providers]);

  useEffect(() => {
    // Keep selection valid if available providers change after load.
    if (!oauthProvidersAvailable.length) return;
    if (oauthProvidersAvailable.some((p) => p.key === oauthProvider)) return;
    setOauthProvider(oauthProvidersAvailable[0]!.key);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [oauthProvidersAvailable.map((p) => p.key).join("|")]);

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
    if (!oauthCandidateId && Array.isArray(j.candidates) && j.candidates.length) setOauthCandidateId(String(j.candidates[0].id));

    // RSS sources (admin-only visibility)
    fetch("/api/admin/rss/list?with_health=1", { method: "GET" })
      .then(async (rr) => {
        const jj = (await rr.json().catch(() => null)) as any;
        if (rr.ok && jj?.ok && Array.isArray(jj.sources)) setRssSources(jj.sources as RssSource[]);
      })
      .catch(() => {});

    // OAuth status (safe)
    fetch("/api/admin/oauth/status", { method: "GET" })
      .then(async (rr) => {
        const jj = (await rr.json().catch(() => null)) as any;
        if (rr.ok && jj?.ok) setOauthStatus({ loaded: true, providers: jj.providers, has_encryption_key: jj.has_encryption_key, counts: jj.counts });
        else setOauthStatus({ loaded: true });
      })
      .catch(() => setOauthStatus({ loaded: true }));
  }

  useEffect(() => {
    void refresh();
    const t = setInterval(() => void refresh(), 45_000);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function addDestination() {
    setMsg(null);
    const guessedKey = newKey || guessNetworkKey(newName, newUrl);
    const scope = newScope || defaultScopeFor(guessedKey || "");
    const payload = {
      politician_id: newFor,
      network_name: newName.trim(),
      network_key: guessedKey || null,
      scope,
      target_id: newTargetId.trim() || null,
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
    // Immediately generate an authorization link (core requirement).
    try {
      await sendInvite({ id: String(j.id) } as any);
    } catch {
      // ignore; still saved
    }
    setNewName("");
    setNewKey("");
    setNewScope("profile");
    setNewTargetId("");
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

  async function saveRouting(d: Destination, patch: Partial<Pick<Destination, "network_key" | "scope" | "target_id">>) {
    setMsg(null);
    const r = await fetch("/api/admin/networks/destinations", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ id: d.id, ...patch }),
    });
    if (!r.ok) {
      setMsg("No fue posible guardar el ruteo.");
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

    if (typeof j.invite_url === "string") {
      setInviteInfo((p) => ({ ...p, [d.id]: { invite_url: String(j.invite_url), expires_at: String(j.expires_at ?? "") } }));
      try {
        await navigator.clipboard.writeText(String(j.invite_url));
        setMsg("Enlace generado y copiado. Envíalo por WhatsApp al dueño para autorizar (expira en 5 horas).");
      } catch {
        setMsg("Enlace generado. Cópialo y envíalo por WhatsApp al dueño (expira en 5 horas).");
      }
    }
    await refresh();
  }

  function destSignal(d: Destination): { status: HealthStatus; label: string } {
    if (!d.active) return { status: null, label: "inactiva" };
    if (d.authorization_status === "approved") return { status: "ok", label: "aprobada" };
    if (d.authorization_status === "pending") return { status: "warn", label: "pendiente" };
    if (d.authorization_status === "expired") return { status: "down", label: "expirada" };
    if (d.authorization_status === "revoked") return { status: "down", label: "revocada" };
    return { status: null, label: d.authorization_status };
  }

  function scopeLabel(c: Candidate): { label: string; cls: string } {
    const off = String(c.office || "").toLowerCase();
    if (off.includes("senado")) return { label: "Alcance nacional (Colombia)", cls: "text-cyan-300" };
    return { label: `Alcance regional (${c.region || "regional"})`, cls: "text-amber-300" };
  }

  async function toggleRss(src: RssSource) {
    setMsg(null);
    const r = await fetch("/api/admin/rss/toggle", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ id: src.id, active: !src.active }),
    });
    if (!r.ok) {
      setMsg("No fue posible actualizar RSS.");
      return;
    }
    await refresh();
  }

  function signalColor(s: HealthStatus, active: boolean): { cls: string; label: string } {
    if (!active) return { cls: "text-muted", label: "inactiva" };
    if (s === "ok") return { cls: "text-emerald-300", label: "ok" };
    if (s === "warn") return { cls: "text-amber-300", label: "degradada" };
    if (s === "down") return { cls: "text-rose-300", label: "caída" };
    return { cls: "text-muted", label: "sin datos" };
  }

  function SignalIcon({ status, active }: { status: HealthStatus; active: boolean }) {
    const c = signalColor(status, active);
    const bar = (n: number) => (
      <span
        className={`inline-block w-[5px] rounded-sm ${c.cls}`}
        style={{ height: `${4 + n * 4}px`, opacity: !active ? 0.35 : 1 }}
      />
    );
    return (
      <span className="inline-flex items-end gap-[2px]" title={c.label}>
        {bar(0)}
        {bar(1)}
        {bar(2)}
        {bar(3)}
      </span>
    );
  }

  async function createRss() {
    setMsg(null);
    const payload = { ...rssForm, name: rssForm.name.trim(), rss_url: rssForm.rss_url.trim() };
    const r = await fetch("/api/admin/rss/sources", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(payload) });
    const j = (await r.json().catch(() => null)) as any;
    if (!r.ok || !j?.ok) {
      setMsg("No fue posible crear la fuente RSS. Verifica URL y región.");
      return;
    }
    setRssForm({ name: "", region_key: rssForm.region_key, rss_url: "", active: true });
    await refresh();
  }

  async function updateRss(src: RssSource, patch: Partial<Pick<RssSource, "name" | "region_key" | "rss_url" | "active">>) {
    setMsg(null);
    const r = await fetch("/api/admin/rss/sources", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ id: src.id, ...patch }) });
    if (!r.ok) {
      setMsg("No fue posible actualizar RSS.");
      return;
    }
    await refresh();
  }

  async function deleteRss(src: RssSource) {
    setMsg(null);
    const ok = window.confirm(`Vas a ELIMINAR la fuente RSS "${src.name}". ¿Continuar?`);
    if (!ok) return;
    const r = await fetch("/api/admin/rss/sources", { method: "DELETE", headers: { "content-type": "application/json" }, body: JSON.stringify({ id: src.id }) });
    if (!r.ok) {
      setMsg("No fue posible eliminar RSS.");
      return;
    }
    await refresh();
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
        <p className="text-sm font-semibold">Fuentes RSS (señal adicional)</p>
        <p className="mt-1 text-xs text-muted">
          Estas fuentes alimentan el motor como señales estructuradas (no reemplazan otras fuentes). Formato requerido:{" "}
          <span className="font-mono">name · region · rss_url · active</span>. La “señal” se calcula automáticamente (no manual).
        </p>

        <div className="mt-4 rounded-2xl border border-border bg-background/60 p-4">
          <p className="text-sm font-semibold">Agregar fuente</p>
          <div className="mt-3 grid gap-2 md:grid-cols-4">
            <input
              className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm"
              placeholder="name (ej. Periódico del Meta)"
              value={rssForm.name}
              onChange={(e) => setRssForm((p) => ({ ...p, name: e.target.value }))}
            />
            <select
              className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm"
              value={rssForm.region_key}
              onChange={(e) => setRssForm((p) => ({ ...p, region_key: e.target.value as any }))}
            >
              <option value="meta">meta</option>
              <option value="colombia">colombia</option>
              <option value="otra">otra</option>
            </select>
            <input
              className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm md:col-span-2"
              placeholder="rss_url (https://...)"
              value={rssForm.rss_url}
              onChange={(e) => setRssForm((p) => ({ ...p, rss_url: e.target.value }))}
            />
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-3">
            <label className="flex items-center gap-2 text-xs text-muted">
              <input type="checkbox" checked={rssForm.active} onChange={(e) => setRssForm((p) => ({ ...p, active: e.target.checked }))} />
              Activa
            </label>
            <button className="glass-button" type="button" onClick={createRss} disabled={!rssForm.name.trim() || !rssForm.rss_url.trim()}>
              Guardar RSS
            </button>
          </div>
        </div>

        <div className="mt-4 grid gap-4 md:grid-cols-2">
          {(["meta", "colombia", "otra"] as const).map((rk) => {
            const rows = rssSources.filter((s) => s.region_key === rk);
            return (
              <div key={rk} className="rounded-2xl border border-border bg-background/60 p-4">
                <p className="text-sm font-semibold">
                  {rk === "meta" ? "Meta (regional)" : rk === "colombia" ? "Colombia (nacional)" : "Otra (manual)"}
                </p>
                <div className="mt-3 grid gap-2">
                  {rows.map((s) => (
                    <div key={s.id} className="flex items-center justify-between gap-3 rounded-xl border border-border bg-background p-3">
                      <div className="min-w-0">
                        <p className="text-sm font-medium">{s.name}</p>
                        <p className="mt-1 text-xs text-muted">
                          <a className="underline" href={s.rss_url} target="_blank" rel="noreferrer">
                            RSS
                          </a>{" "}
                          ·{" "}
                          <a className="underline" href={s.base_url} target="_blank" rel="noreferrer">
                            sitio
                          </a>
                        </p>
                        <p className="mt-1 text-[11px] text-muted">
                          señal:{" "}
                          <span className={signalColor(s.last_health_status ?? null, s.active).cls}>
                            {signalColor(s.last_health_status ?? null, s.active).label}
                          </span>
                          {typeof s.last_health_ms === "number" ? ` · ${s.last_health_ms}ms` : ""}
                          {typeof s.last_item_count === "number" ? ` · items=${s.last_item_count}` : ""}
                        </p>
                      </div>
                      <div className="flex shrink-0 items-center gap-2">
                        <SignalIcon status={s.last_health_status ?? null} active={s.active} />
                        <button className="glass-button" type="button" onClick={() => toggleRss(s)}>
                          {s.active ? "Desactivar" : "Activar"}
                        </button>
                        <button className="glass-button" type="button" onClick={refresh} title="Re-chequear (refrescar)">
                          Rechequear
                        </button>
                        <button className="glass-button" type="button" onClick={() => deleteRss(s)}>
                          Eliminar
                        </button>
                      </div>
                    </div>
                  ))}
                  {rows.length === 0 ? <p className="text-sm text-muted">Sin fuentes.</p> : null}
                </div>
              </div>
            );
          })}
        </div>
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

            <label className="mt-2 text-xs font-semibold text-muted">Network key (ruteo automático)</label>
            <select className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm" value={newKey} onChange={(e) => setNewKey((e.target.value as any) || "")}>
              <option value="">(auto-detectar)</option>
              {NETWORK_KEYS.map((k) => (
                <option key={k} value={k}>
                  {k}
                </option>
              ))}
            </select>

            <label className="mt-2 text-xs font-semibold text-muted">Scope</label>
            <select className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm" value={newScope} onChange={(e) => setNewScope(e.target.value as any)}>
              {SCOPES.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>

            <label className="mt-2 text-xs font-semibold text-muted">Target ID (page_id / handle / channel_id)</label>
            <input
              className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm"
              value={newTargetId}
              onChange={(e) => setNewTargetId(e.target.value)}
              placeholder="Opcional (recomendado para publicación en n8n)"
            />

            <p className="mt-2 text-xs text-muted">
              Credenciales: el sistema las resuelve internamente por red (el admin no debe elegir credenciales).
            </p>

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

      <div className="glass-card p-6">
        <p className="text-sm font-semibold">Conectar redes por enlace (OAuth)</p>
        <p className="mt-1 text-xs text-muted">
          Este flujo es opcional y no reemplaza la autorización por enlace. Sirve para que el dueño conecte su cuenta oficial (Meta/X/Reddit) desde el celular.
        </p>
        <details className="mt-4 rounded-2xl border border-border bg-background/60 p-4">
          <summary className="cursor-pointer text-sm font-semibold">Generar enlace de conexión</summary>
          <div className="mt-4 grid gap-3 md:grid-cols-2">
            <div className="grid gap-2">
              <label className="text-xs font-semibold text-muted">Red</label>
              <select className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm" value={oauthProvider} onChange={(e) => setOauthProvider(e.target.value as OAuthProviderKey)}>
                {oauthProvidersAvailable.map((p) => (
                  <option key={p.key} value={p.key}>
                    {p.label}
                  </option>
                ))}
              </select>
              <p className="text-xs text-muted">
                Estado:{" "}
                {oauthStatus.loaded ? (
                  <>
                    {oauthProvidersAvailable.length ? (
                      <span className="text-emerald-300">configurado</span>
                    ) : (
                      <span className="text-amber-300">no configurado</span>
                    )}
                    {" · "}
                    {oauthStatus.has_encryption_key ? <span className="text-emerald-300">cifrado OK</span> : <span className="text-amber-300">falta cifrado</span>}
                  </>
                ) : (
                  <span className="text-muted">cargando…</span>
                )}
              </p>
              {!oauthProvidersAvailable.length && oauthStatus.loaded ? (
                <p className="text-xs text-muted">
                  No hay proveedores OAuth disponibles en este entorno. Se mostrarán automáticamente cuando estén configurados en el servidor.
                </p>
              ) : null}
            </div>

            <div className="grid gap-2">
              <label className="text-xs font-semibold text-muted">Candidato</label>
              <select className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm" value={oauthCandidateId} onChange={(e) => setOauthCandidateId(e.target.value)}>
                {candidates.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name} · {c.office} · {c.region}
                  </option>
                ))}
              </select>
              <button
                className="glass-button mt-2"
                type="button"
                onClick={async () => {
                  const base = window.location.origin.replace(/\/+$/, "");
                  const link = `${base}/connect/${encodeURIComponent(oauthProvider)}?candidate_id=${encodeURIComponent(oauthCandidateId)}`;
                  setOauthLink(link);
                  try {
                    await navigator.clipboard.writeText(link);
                    setMsg("Enlace OAuth generado y copiado. Envíalo por WhatsApp al dueño para conectar su cuenta.");
                  } catch {
                    setMsg("Enlace OAuth generado. Cópialo y envíalo por WhatsApp al dueño.");
                  }
                }}
                disabled={!oauthCandidateId || !oauthProvidersAvailable.length}
              >
                Generar enlace OAuth (copiar)
              </button>
            </div>
          </div>

          {oauthLink ? (
            <div className="mt-4 rounded-xl border border-border bg-background p-3">
              <p className="text-xs font-semibold text-muted">Enlace de conexión (envíalo por WhatsApp)</p>
              <p className="mt-1 break-all text-xs text-muted">{oauthLink}</p>
              <p className="mt-2 text-[11px] text-muted">
                Nota: si el proveedor aún no está configurado, el enlace mostrará “no disponible” sin afectar el resto del sistema.
              </p>
            </div>
          ) : null}
        </details>
      </div>

      {loadState === "error" ? (
        <div className="glass-card p-6">
          <p className="text-sm text-amber-300">No se pudo cargar. Verifica migración y permisos.</p>
        </div>
      ) : null}

      <div className="space-y-5">
        {candidates.map((c) => {
          const rows = byCandidate[c.id] ?? [];
          const scope = scopeLabel(c);
          return (
            <div key={c.id} className="glass-card p-6">
              <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="text-sm font-semibold">{c.name}</p>
                  <p className="text-xs text-muted">
                    {c.office} · {c.region}
                    {c.ballot_number ? ` · Tarjetón ${c.ballot_number}` : ""}
                  </p>
                  <p className={`mt-1 text-xs ${scope.cls}`}>{scope.label}</p>
                </div>
                <p className="text-xs text-muted">Redes: {rows.length}</p>
              </div>

              {rows.length ? (
                <div className="mt-4 grid gap-3 md:grid-cols-2">
                  {rows.map((d) => {
                    const guessed = guessNetworkKey(d.network_name, d.profile_or_page_url);
                    const effectiveKey = (routing[d.id]?.network_key ?? (d.network_key as any) ?? guessed ?? "") as NetworkKey | "";
                    const effectiveScope = (routing[d.id]?.scope ?? ((d.scope as any) || defaultScopeFor(effectiveKey || guessed || ""))) as Scope;
                    const effectiveTargetId = routing[d.id]?.target_id ?? (d.target_id ?? "");
                    const current = routing[d.id] ?? { network_key: effectiveKey, scope: effectiveScope, target_id: effectiveTargetId };

                    return (
                      <div key={d.id} className="rounded-2xl border border-border bg-background/60 p-4">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="text-sm font-semibold">{d.network_name}</p>
                          <p className="mt-1 text-xs text-muted">
                            <span className="inline-flex items-center gap-2">
                              <SignalIcon status={destSignal(d).status} active={d.active} />{" "}
                              <span className={signalColor(destSignal(d).status, d.active).cls}>{destSignal(d).label}</span>
                            </span>
                            {" · "}
                            {d.network_type}
                            {" · "}
                            {d.active ? <span className="text-emerald-300">active</span> : <span className="text-rose-300">inactive</span>}
                          </p>
                          <p className="mt-1 text-xs text-muted">
                            ruteo: <span className="font-medium">{effectiveKey || "(auto)"}</span> · scope:{" "}
                            <span className="font-medium">{effectiveScope}</span>
                            {effectiveTargetId ? (
                              <>
                                {" "}
                                · target: <span className="font-medium">{effectiveTargetId}</span>
                              </>
                            ) : null}
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
                            Autorizó: {d.authorized_by_name ?? "—"}
                            {d.authorized_at ? ` · ${new Date(d.authorized_at).toLocaleString("es-CO")}` : ""}
                          </p>
                          <p className="mt-1 text-xs text-muted">
                            Último invite: {d.last_invite_sent_at ? new Date(d.last_invite_sent_at).toLocaleString("es-CO") : "—"}
                          </p>

                          <div className="mt-3 grid gap-2 rounded-xl border border-border bg-background p-3">
                            <p className="text-xs font-semibold text-muted">Ruteo n8n (sin secretos)</p>
                            <div className="grid gap-2 sm:grid-cols-2">
                              <div className="grid gap-1">
                                <label className="text-[11px] font-semibold text-muted">Network</label>
                                <select
                                  className="w-full rounded-lg border border-border bg-background px-2 py-1 text-xs"
                                  value={current.network_key}
                                  onChange={(e) => setRouting((p) => ({ ...p, [d.id]: { ...current, network_key: (e.target.value as any) || "" } }))}
                                >
                                  <option value="">(auto)</option>
                                  {NETWORK_KEYS.map((k) => (
                                    <option key={k} value={k}>
                                      {k}
                                    </option>
                                  ))}
                                </select>
                              </div>
                              <div className="grid gap-1">
                                <label className="text-[11px] font-semibold text-muted">Scope</label>
                                <select
                                  className="w-full rounded-lg border border-border bg-background px-2 py-1 text-xs"
                                  value={current.scope}
                                  onChange={(e) => setRouting((p) => ({ ...p, [d.id]: { ...current, scope: e.target.value as any } }))}
                                >
                                  {SCOPES.map((s) => (
                                    <option key={s} value={s}>
                                      {s}
                                    </option>
                                  ))}
                                </select>
                              </div>
                            </div>
                            <div className="grid gap-2 sm:grid-cols-2">
                              <div className="grid gap-1">
                                <label className="text-[11px] font-semibold text-muted">Target ID</label>
                                <input
                                  className="w-full rounded-lg border border-border bg-background px-2 py-1 text-xs"
                                  value={current.target_id}
                                  onChange={(e) => setRouting((p) => ({ ...p, [d.id]: { ...current, target_id: e.target.value } }))}
                                  placeholder="page_id / handle / channel_id"
                                />
                              </div>
                              <div className="grid gap-1">
                                <label className="text-[11px] font-semibold text-muted">Credencial</label>
                                <p className="text-xs text-muted">Auto (por red)</p>
                              </div>
                            </div>
                            <div className="flex flex-wrap gap-2">
                              <button
                                className="glass-button"
                                type="button"
                                onClick={() =>
                                  saveRouting(d, {
                                    network_key: current.network_key || null,
                                    scope: current.scope,
                                    target_id: current.target_id.trim() || null,
                                  })
                                }
                              >
                                Guardar ruteo
                              </button>
                              <button
                                className="glass-button"
                                type="button"
                                onClick={() => setRouting((p) => ({ ...p, [d.id]: { ...current, network_key: guessed || "", scope: defaultScopeFor(guessed || ""), target_id: current.target_id } }))}
                              >
                                Auto-detectar
                              </button>
                            </div>
                          </div>
                        </div>
                      </div>

                      <div className="mt-3 flex flex-wrap gap-2">
                        <button className="glass-button" type="button" onClick={() => sendInvite(d)}>
                          Generar enlace (copiar)
                        </button>
                        {inviteInfo[d.id]?.invite_url ? (
                          <button
                            className="glass-button"
                            type="button"
                            onClick={() => navigator.clipboard.writeText(inviteInfo[d.id]!.invite_url)}
                          >
                            Copiar enlace
                          </button>
                        ) : null}
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

                      {inviteInfo[d.id]?.invite_url ? (
                        <div className="mt-3 rounded-xl border border-border bg-background p-3">
                          <p className="text-xs font-semibold text-muted">Enlace de autorización (para WhatsApp)</p>
                          <p className="mt-1 break-all text-xs text-muted">{inviteInfo[d.id]!.invite_url}</p>
                          <p className="mt-1 text-[11px] text-muted">
                            Expira:{" "}
                            {inviteInfo[d.id]!.expires_at ? new Date(inviteInfo[d.id]!.expires_at).toLocaleString("es-CO") : "—"}
                          </p>
                        </div>
                      ) : null}

                      <div className="mt-3 rounded-xl border border-border bg-background p-3">
                        <p className="text-xs text-muted">
                          - La autorización se hace vía WhatsApp con enlace temporal (5h).<br />
                          - El dueño conserva control total (aprobar/rechazar).<br />
                          - No se publica nada sin aprobación explícita.
                        </p>
                      </div>
                    </div>
                    );
                  })}
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

