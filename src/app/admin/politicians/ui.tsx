"use client";

import Link from "next/link";
import { useMemo, useState } from "react";

type Politician = {
  id: string;
  slug: string;
  name: string;
  office: string;
  region: string;
  party: string | null;
  updated_at: string;
};

export function AdminPoliticiansClient({ initial }: { initial: Politician[] }) {
  const [items, setItems] = useState<Politician[]>(initial);
  const [creating, setCreating] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const [slug, setSlug] = useState("");
  const [name, setName] = useState("");
  const [office, setOffice] = useState("Cámara de Representantes");
  const [region, setRegion] = useState("Meta");
  const [party, setParty] = useState("");

  const canCreate = useMemo(() => slug.trim() && name.trim() && office.trim() && region.trim(), [slug, name, office, region]);

  async function refresh() {
    const res = await fetch("/api/admin/politicians/list", { method: "GET" });
    if (!res.ok) return;
    const json = (await res.json()) as { ok: boolean; politicians: Politician[] };
    if (json.ok) setItems(json.politicians ?? []);
  }

  async function create() {
    setMsg(null);
    if (!canCreate) return;
    setCreating(true);
    const res = await fetch("/api/admin/politicians", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        slug: slug.trim().toLowerCase(),
        name: name.trim(),
        office: office.trim(),
        region: region.trim(),
        party: party.trim() ? party.trim() : null,
      }),
    });
    setCreating(false);
    if (!res.ok) {
      setMsg("No fue posible crear el candidato (verifica slug y configuración Supabase).");
      return;
    }
    setSlug("");
    setName("");
    setParty("");
    setMsg("Candidato creado.");
    await refresh();
  }

  return (
    <div className="space-y-8">
      <div className="glass-card p-6">
        <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
          <div>
            <h2 className="text-base font-semibold">Candidatos</h2>
            <p className="text-sm text-muted">Crea candidatos y entra a su workspace.</p>
          </div>
          <button className="glass-button" type="button" onClick={refresh}>
            Actualizar lista
          </button>
        </div>

        <div className="mt-4 grid gap-3 md:grid-cols-5">
          <div className="grid gap-1 md:col-span-1">
            <label className="text-sm font-medium">Slug (ID)</label>
            <input
              className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm"
              value={slug}
              onChange={(e) => setSlug(e.target.value)}
              placeholder="ej: maria-perez"
            />
            <p className="text-xs text-muted">minúsculas, números y guiones.</p>
          </div>
          <div className="grid gap-1 md:col-span-2">
            <label className="text-sm font-medium">Nombre</label>
            <input
              className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Nombre completo"
            />
          </div>
          <div className="grid gap-1">
            <label className="text-sm font-medium">Cargo</label>
            <select className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm" value={office} onChange={(e) => setOffice(e.target.value)}>
              <option value="Cámara de Representantes">Cámara de Representantes</option>
              <option value="Senado de la República">Senado de la República</option>
            </select>
          </div>
          <div className="grid gap-1">
            <label className="text-sm font-medium">Región</label>
            <input
              className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm"
              value={region}
              onChange={(e) => setRegion(e.target.value)}
              placeholder="Meta / Nacional"
            />
          </div>
          <div className="grid gap-1 md:col-span-2">
            <label className="text-sm font-medium">Partido (opcional)</label>
            <input className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm" value={party} onChange={(e) => setParty(e.target.value)} />
          </div>
          <div className="md:col-span-3 flex items-end gap-2">
            <button className="glass-button" type="button" onClick={create} disabled={!canCreate || creating}>
              {creating ? "Creando…" : "Crear candidato"}
            </button>
            {msg ? <p className="text-sm text-muted">{msg}</p> : null}
          </div>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        {items.map((p) => (
          <Link key={p.id} href={`/admin/politicians/${p.id}`} className="glass-card p-6 transition hover:bg-white/10">
            <p className="text-sm font-semibold">{p.name}</p>
            <p className="mt-1 text-sm text-muted">{p.office}</p>
            <p className="mt-1 text-xs text-muted">
              {p.region}
              {p.party ? ` · ${p.party}` : ""}
            </p>
            <p className="mt-3 text-xs text-muted">Última actualización: {new Date(p.updated_at).toLocaleString("es-CO")}</p>
          </Link>
        ))}
      </div>

      {items.length === 0 ? <p className="text-sm text-muted">No hay candidatos cargados aún.</p> : null}
    </div>
  );
}

