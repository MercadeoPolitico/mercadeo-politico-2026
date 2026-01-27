"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ensureSocialVariants } from "@/lib/automation/socialVariants";

type Politician = {
  id: string;
  slug: string;
  name: string;
  office: string;
  party: string | null;
  region: string;
  ballot_number: number | null;
  auto_publish_enabled: boolean;
  auto_blog_enabled: boolean;
  biography: string;
  proposals: string;
  updated_at: string;
};

type SocialLink = {
  id: string;
  platform: string;
  handle: string | null;
  url: string;
  status: string;
  created_at: string;
};

type Publication = {
  id: string;
  platform: string;
  title: string | null;
  content: string;
  variants: Record<string, unknown> | null;
  media_urls: string[] | null;
  status: string;
  rotation_window_days: number | null;
  expires_at: string | null;
  created_at: string;
  updated_at: string;
  decided_at: string | null;
  decision_notes: string | null;
};

export function PoliticianWorkspaceClient({
  politician,
  links: initialLinks,
  publications: initialPublications,
}: {
  politician: Politician;
  links: SocialLink[];
  publications: Publication[];
}) {
  const initialSnapshot = useMemo(
    () => ({
      name: politician.name ?? "",
      office: politician.office ?? "",
      region: politician.region ?? "",
      party: politician.party ?? "",
      bio: politician.biography ?? "",
      proposals: politician.proposals ?? "",
      ballotNumber: politician.ballot_number ? String(politician.ballot_number) : "",
    }),
    [politician.ballot_number, politician.biography, politician.name, politician.office, politician.party, politician.proposals, politician.region]
  );

  const [name, setName] = useState(initialSnapshot.name);
  const [office, setOffice] = useState(initialSnapshot.office);
  const [region, setRegion] = useState(initialSnapshot.region);
  const [party, setParty] = useState<string>(initialSnapshot.party);
  const [bio, setBio] = useState(initialSnapshot.bio);
  const [proposals, setProposals] = useState(initialSnapshot.proposals);
  const [ballotNumber, setBallotNumber] = useState<string>(initialSnapshot.ballotNumber);
  const [savingProfile, setSavingProfile] = useState(false);
  const [profileMsg, setProfileMsg] = useState<string | null>(null);
  const [savedSnapshot, setSavedSnapshot] = useState(initialSnapshot);

  const hasUnsavedProfileChanges =
    name !== savedSnapshot.name ||
    office !== savedSnapshot.office ||
    region !== savedSnapshot.region ||
    party !== savedSnapshot.party ||
    bio !== savedSnapshot.bio ||
    proposals !== savedSnapshot.proposals ||
    ballotNumber !== savedSnapshot.ballotNumber;

  const [links, setLinks] = useState<SocialLink[]>(initialLinks);
  const [newPlatform, setNewPlatform] = useState("facebook");
  const [newHandle, setNewHandle] = useState("");
  const [newUrl, setNewUrl] = useState("");
  const [linkMsg, setLinkMsg] = useState<string | null>(null);

  const [publications, setPublications] = useState<Publication[]>(initialPublications);
  const pubCounts = useMemo(() => {
    const c: Record<string, number> = {};
    for (const p of publications) c[p.status] = (c[p.status] ?? 0) + 1;
    return c;
  }, [publications]);
  const [pubListMode, setPubListMode] = useState<"all" | "pending_approval" | "approved" | "rejected">("all");
  const [pubPlatform, setPubPlatform] = useState("facebook");
  const [pubTitle, setPubTitle] = useState("");
  const [pubContent, setPubContent] = useState("");
  const [pubMedia, setPubMedia] = useState("");
  const [pubRotationDays, setPubRotationDays] = useState<string>("7");
  const [pubExpiresAt, setPubExpiresAt] = useState<string>("");
  const [pubVariants, setPubVariants] = useState<{ facebook: string; instagram: string; x: string } | null>(null);
  const [pubMsg, setPubMsg] = useState<string | null>(null);
  const [creatingPub, setCreatingPub] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadMsg, setUploadMsg] = useState<string | null>(null);
  const [loadingFromDraft, setLoadingFromDraft] = useState(false);
  const [prefilledFromDraft, setPrefilledFromDraft] = useState(false);

  async function loadLatestDraftIntoPublication() {
    setPubMsg(null);
    setLoadingFromDraft(true);
    const res = await fetch(`/api/admin/politicians/drafts/latest?candidate_id=${encodeURIComponent(politician.id)}`, { method: "GET" }).catch(
      () => null,
    );
    const j = (await res?.json().catch(() => null)) as any;
    setLoadingFromDraft(false);
    if (!res || !res.ok || !j?.ok || !j?.draft) {
      setPubMsg("No fue posible cargar el último borrador (revisa Admin → Contenido).");
      return false;
    }
    const text = String(j.draft.generated_text ?? "").trim();
    if (!text) {
      setPubMsg("El borrador encontrado no tiene texto.");
      return false;
    }
    setPubContent(text);
    const v = (j.draft.variants && typeof j.draft.variants === "object" ? j.draft.variants : null) as any;
    const computed = ensureSocialVariants({
      baseText: text,
      blogText: text,
      variants: v,
      seo_keywords: (politician as any)?.seo_keywords ?? [],
      candidate: { name, ballot_number: ballotNumber.trim() ? ballotNumber.trim() : politician.ballot_number ?? null },
    });
    setPubVariants({ facebook: computed.facebook, instagram: computed.instagram, x: computed.x });
    return true;
  }

  // Autopoblar variantes cuando hay base (sin pisar ediciones manuales).
  useEffect(() => {
    const base = pubContent.trim();
    if (!base) return;
    if (pubVariants && (pubVariants.facebook.trim() || pubVariants.instagram.trim() || pubVariants.x.trim())) return;
    const computed = ensureSocialVariants({
      baseText: base,
      blogText: base,
      variants: null,
      seo_keywords: (politician as any)?.seo_keywords ?? [],
      candidate: { name, ballot_number: ballotNumber.trim() ? ballotNumber.trim() : politician.ballot_number ?? null },
    });
    setPubVariants({ facebook: computed.facebook, instagram: computed.instagram, x: computed.x });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pubContent]);

  // Auto-cargar el último borrador (mejor UX): solo si el formulario está vacío.
  useEffect(() => {
    if (prefilledFromDraft) return;
    if (pubContent.trim()) return;
    void (async () => {
      const ok = await loadLatestDraftIntoPublication();
      setPrefilledFromDraft(true);
      if (!ok) setPrefilledFromDraft(true);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [politician.id]);

  function removeMediaUrl(url: string) {
    const parts = pubMedia
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean)
      .filter((u) => u !== url);
    setPubMedia(parts.join(", "));
  }

  const [accessMsg, setAccessMsg] = useState<string | null>(null);
  const [accessLink, setAccessLink] = useState<string | null>(null);
  const [accessLoading, setAccessLoading] = useState(false);

  const [hubMsg, setHubMsg] = useState<string | null>(null);
  const [hubLoading, setHubLoading] = useState(false);
  const [files, setFiles] = useState<{ name: string; url: string }[]>([]);
  const [analyzeLoading, setAnalyzeLoading] = useState<string | null>(null);

  async function refreshPublications() {
    const res = await fetch(`/api/admin/politicians/publications?politician_id=${encodeURIComponent(politician.id)}`, { method: "GET" }).catch(
      () => null
    );
    if (!res || !res.ok) return;
    const json = (await res.json().catch(() => null)) as any;
    if (json?.ok && Array.isArray(json.publications)) setPublications(json.publications as Publication[]);
  }

  async function refreshLinks() {
    const res = await fetch(`/api/admin/politicians/links?politician_id=${encodeURIComponent(politician.id)}`, { method: "GET" }).catch(() => null);
    if (!res || !res.ok) return;
    const json = (await res.json().catch(() => null)) as any;
    if (json?.ok && Array.isArray(json.links)) setLinks(json.links as SocialLink[]);
  }

  async function saveProfile() {
    setProfileMsg(null);
    setSavingProfile(true);
    const bn = ballotNumber.trim() ? Number(ballotNumber.trim()) : null;
    const res = await fetch("/api/admin/politicians", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        id: politician.id,
        name: name.trim(),
        office: office.trim(),
        region: region.trim(),
        party: party.trim() ? party.trim() : "",
        biography: bio,
        proposals,
        ballot_number: Number.isFinite(bn as number) ? (bn as number) : null,
      }),
    }).catch(() => null);
    setSavingProfile(false);
    if (!res || !res.ok) {
      setProfileMsg("No fue posible guardar.");
      return;
    }
    setProfileMsg("Guardado.");
    setSavedSnapshot({ name, office, region, party, bio, proposals, ballotNumber });
  }

  const [photoUploading, setPhotoUploading] = useState(false);
  const [photoMsg, setPhotoMsg] = useState<string | null>(null);
  const [photoVersion, setPhotoVersion] = useState(0);

  const profilePhotoUrl = useMemo(() => {
    // Show the same public URL the landing uses (redirects to storage if present).
    return `/api/candidates/photo?id=${encodeURIComponent(politician.id)}&v=${photoVersion}`;
  }, [photoVersion, politician.id]);

  async function uploadProfilePhoto(file: File) {
    setPhotoMsg(null);
    setPhotoUploading(true);
    const fd = new FormData();
    fd.set("politician_id", politician.id);
    fd.set("file", file);
    const res = await fetch("/api/admin/politicians/photo", { method: "POST", body: fd });
    setPhotoUploading(false);
    const j = (await res.json().catch(() => null)) as any;
    if (!res.ok || !j?.ok) {
      const err = typeof j?.error === "string" ? j.error : "upload_failed";
      setPhotoMsg(`No fue posible subir la foto: ${err}`);
      return;
    }
    setPhotoVersion((v) => v + 1);
    setPhotoMsg("Foto guardada. Se reflejará en el landing/candidatos.");
  }

  async function deleteProfilePhoto() {
    const ok = window.confirm("¿Eliminar la foto del candidato?");
    if (!ok) return;
    setPhotoMsg(null);
    setPhotoUploading(true);
    const res = await fetch("/api/admin/politicians/photo", {
      method: "DELETE",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ politician_id: politician.id }),
    });
    setPhotoUploading(false);
    if (!res.ok) {
      setPhotoMsg("No fue posible eliminar la foto.");
      return;
    }
    setPhotoVersion((v) => v + 1);
    setPhotoMsg("Foto eliminada.");
  }

  const [deleteMsg, setDeleteMsg] = useState<string | null>(null);
  const [deleteLoading, setDeleteLoading] = useState(false);
  async function deleteCandidate() {
    const ok = window.confirm(`Vas a ELIMINAR el candidato "${politician.name}". Esta acción no se puede deshacer. ¿Continuar?`);
    if (!ok) return;
    setDeleteMsg(null);
    setDeleteLoading(true);
    const res = await fetch("/api/admin/politicians", {
      method: "DELETE",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ id: politician.id }),
    });
    setDeleteLoading(false);
    if (!res.ok) {
      setDeleteMsg("No fue posible eliminar.");
      return;
    }
    window.location.assign("/admin/politicians");
  }

  async function addLink() {
    setLinkMsg(null);
    const url = newUrl.trim();
    if (!url) {
      setLinkMsg("URL requerida.");
      return;
    }
    if (!/^https?:\/\//i.test(url)) {
      setLinkMsg("La URL debe iniciar con http:// o https://");
      return;
    }
    if (!/^[a-z]+$/i.test(newPlatform)) {
      setLinkMsg("Plataforma inválida.");
      return;
    }
    const res = await fetch("/api/admin/politicians/links", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        politician_id: politician.id,
        platform: newPlatform,
        handle: newHandle.trim() ? newHandle.trim() : null,
        url,
      }),
    }).catch(() => null);
    if (!res || !res.ok) {
      setLinkMsg("No fue posible agregar el enlace.");
      return;
    }
    setNewHandle("");
    setNewUrl("");
    await refreshLinks();
  }

  async function deleteLink(id: string) {
    setLinkMsg(null);
    const res = await fetch("/api/admin/politicians/links", {
      method: "DELETE",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ id }),
    }).catch(() => null);
    if (!res || !res.ok) {
      setLinkMsg("No fue posible eliminar el enlace.");
      return;
    }
    await refreshLinks();
  }

  async function toggleLinkStatus(link: SocialLink) {
    setLinkMsg(null);
    const next = link.status === "active" ? "inactive" : "active";
    const res = await fetch("/api/admin/politicians/links", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ id: link.id, status: next }),
    }).catch(() => null);
    if (!res || !res.ok) {
      setLinkMsg("No fue posible actualizar el estado.");
      return;
    }
    await refreshLinks();
  }

  async function createPublication() {
    setPubMsg(null);
    const content = pubContent.trim();
    if (!content) {
      setPubMsg("Contenido requerido.");
      return;
    }

    const media_urls = pubMedia
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);

    const computed = ensureSocialVariants({
      baseText: content,
      blogText: content,
      variants: pubVariants ?? null,
      seo_keywords: (politician as any)?.seo_keywords ?? [],
      candidate: { name, ballot_number: ballotNumber.trim() ? ballotNumber.trim() : politician.ballot_number ?? null },
    });
    const nextVariants = pubVariants ?? { facebook: computed.facebook, instagram: computed.instagram, x: computed.x };

    const rotation = pubRotationDays.trim() ? Number(pubRotationDays) : null;
    const expires_at = pubExpiresAt.trim() ? new Date(pubExpiresAt).toISOString() : null;

    setCreatingPub(true);
    const res = await fetch("/api/admin/politicians/publications", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        politician_id: politician.id,
        platform: pubPlatform,
        title: pubTitle.trim() ? pubTitle.trim() : null,
        content,
        variants: nextVariants,
        media_urls: media_urls.length ? media_urls : null,
        rotation_window_days: Number.isFinite(rotation as number) ? rotation : null,
        expires_at,
      }),
    }).catch(() => null);
    setCreatingPub(false);

    if (!res || !res.ok) {
      setPubMsg("No fue posible crear la publicación.");
      return;
    }

    setPubTitle("");
    setPubContent("");
    setPubMedia("");
    setPubVariants(null);
    await refreshPublications();
  }

  async function uploadMedia(file: File) {
    setUploadMsg(null);
    setUploading(true);
    const fd = new FormData();
    fd.set("politician_id", politician.id);
    fd.set("file", file);
    const res = await fetch("/api/admin/politicians/media", { method: "POST", body: fd }).catch(() => null);
    const j = (await res?.json().catch(() => null)) as any;
    if (!res || !res.ok || !j?.ok || typeof j?.url !== "string") {
      setUploading(false);
      setUploadMsg("No fue posible subir el archivo (verifica configuración/permisos).");
      return;
    }
    const url = String(j.url);
    setUploading(false);

    // Append to media field (comma-separated)
    setPubMedia((prev) => {
      const next = prev.trim();
      return next ? `${next}, ${url}` : url;
    });
    setUploadMsg("Archivo subido (optimizado cuando aplica). Se agregó el URL al campo de media.");
  }

  async function refreshFiles() {
    setHubMsg(null);
    const res = await fetch(`/api/admin/politicians/media?politician_id=${encodeURIComponent(politician.id)}`, { method: "GET" }).catch(
      () => null
    );
    if (!res || !res.ok) return;
    const j = (await res.json().catch(() => null)) as any;
    if (j?.ok && Array.isArray(j.files)) setFiles(j.files as { name: string; url: string }[]);
  }

  async function analyzeFileToDraft(f: { name: string; url: string }) {
    setHubMsg(null);
    setAnalyzeLoading(f.name);
    const resp = await fetch("/api/admin/politicians/files/analyze", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ politician_id: politician.id, file_url: f.url, filename: f.name }),
    });
    setAnalyzeLoading(null);
    const j = (await resp.json().catch(() => null)) as any;
    if (!resp.ok || !j?.ok) {
      const err = typeof j?.error === "string" ? j.error : "analyze_failed";
      setHubMsg(`No fue posible analizar el archivo: ${err}`);
      return;
    }
    setHubMsg("Documento analizado: borrador creado en Admin → Contenido.");
  }

  async function generateNewsBlog() {
    setHubMsg(null);
    setHubLoading(true);
    const resp = await fetch("/api/admin/politicians/news-blog", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ candidate_id: politician.id }),
    });
    setHubLoading(false);
    if (!resp.ok) {
      setHubMsg("No fue posible generar el blog automático (verifica Marleny AI / Supabase).");
      return;
    }
    setHubMsg("Borrador generado y enviado a la cola de revisión.");
  }

  async function orchestrateEditorial() {
    setHubMsg(null);
    setHubLoading(true);
    const resp = await fetch("/api/admin/automation/editorial-orchestrate", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ candidate_id: politician.id, max_items: 1 }),
    });

    setHubLoading(false);
    if (!resp.ok) {
      setHubMsg("No fue posible orquestar el borrador (verifica Marleny/OpenAI y configuración).");
      return;
    }

    const data = (await resp.json()) as { ok?: unknown; skipped?: unknown; id?: unknown };
    if (data.ok === true) {
      setHubMsg("Borrador creado en cola de revisión (ai_drafts).");
      return;
    }
    setHubMsg("Respuesta inválida.");
  }

  async function sendPublicationToAutomation(p: Publication) {
    setPubMsg(null);
    if (p.status !== "approved") return;
    const resp = await fetch("/api/admin/politicians/publications/send", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ publication_id: p.id }),
    });
    if (!resp.ok) {
      setPubMsg("No fue posible enviar a automatización (verifica n8n config).");
      return;
    }
    await refreshPublications();
  }

  async function generateAccessLink() {
    setAccessMsg(null);
    setAccessLink(null);
    setAccessLoading(true);

    const resp = await fetch("/api/admin/politicians/access-link", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ politician_id: politician.id }),
    });

    setAccessLoading(false);

    if (!resp.ok) {
      setAccessMsg("No fue posible generar el enlace.");
      return;
    }

    const data = (await resp.json()) as { ok?: unknown; url?: unknown };
    if (data.ok !== true || typeof data.url !== "string") {
      setAccessMsg("Respuesta inválida.");
      return;
    }

    setAccessLink(data.url);
  }

  return (
    <div className="space-y-10">
      <header className="space-y-2">
        <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">{politician.name}</h1>
            <p className="text-sm text-muted">
              {politician.office} · {politician.region}
              {politician.party ? ` · ${politician.party}` : ""}
            </p>
            {hasUnsavedProfileChanges ? <p className="mt-2 text-xs text-amber-200">Cambios sin guardar.</p> : null}
          </div>
          <div className="flex flex-wrap gap-2">
            <button className="glass-button" type="button" onClick={saveProfile} disabled={savingProfile || !hasUnsavedProfileChanges}>
              {savingProfile ? "Guardando…" : "Guardar cambios"}
            </button>
            <Link className="glass-button inline-flex items-center justify-center" href="/admin/politicians">
              Volver
            </Link>
          </div>
        </div>
      </header>

      <section className="glass-card space-y-4 p-6">
        <div className="space-y-1">
          <h2 className="text-base font-semibold">Perfil</h2>
          <p className="text-sm text-muted">Biografía y propuestas (editable). Esto alimenta el workspace interno.</p>
        </div>

        <div className="grid gap-4 lg:grid-cols-2">
          <div className="grid gap-3">
            <div className="grid gap-1">
              <label className="text-sm font-medium">Nombre</label>
              <input className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm" value={name} onChange={(e) => setName(e.target.value)} />
            </div>
            <div className="grid gap-1">
              <label className="text-sm font-medium">Cargo</label>
              <input className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm" value={office} onChange={(e) => setOffice(e.target.value)} />
            </div>
            <div className="grid gap-1">
              <label className="text-sm font-medium">Región</label>
              <input className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm" value={region} onChange={(e) => setRegion(e.target.value)} />
            </div>
            <div className="grid gap-1">
              <label className="text-sm font-medium">Partido (opcional)</label>
              <input className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm" value={party} onChange={(e) => setParty(e.target.value)} />
            </div>

            <div className="rounded-2xl border border-border bg-background/60 p-4">
              <p className="text-sm font-semibold">Foto del candidato</p>
              <p className="mt-1 text-xs text-muted">Se publica en landing y en /candidates. Sin logos/texto agregado.</p>
              <div className="mt-3 grid gap-2">
                <div className="flex items-center gap-3">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={profilePhotoUrl}
                    alt={`Foto de ${politician.name}`}
                    className="h-20 w-20 rounded-full border border-border bg-background object-contain p-1"
                  />
                  <div className="min-w-0">
                    <p className="text-xs text-muted">Vista previa (lo mismo que ve el público).</p>
                    <p className="text-[11px] text-muted">Tip: si no actualiza, recarga con Ctrl+F5.</p>
                  </div>
                </div>
                <input
                  className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm"
                  type="file"
                  accept="image/*"
                  disabled={photoUploading}
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) void uploadProfilePhoto(f);
                    e.currentTarget.value = "";
                  }}
                />
                <div className="flex flex-wrap gap-2">
                  <button className="glass-button" type="button" onClick={() => void deleteProfilePhoto()} disabled={photoUploading}>
                    Eliminar foto
                  </button>
                  <a className="glass-button inline-flex items-center justify-center" href={profilePhotoUrl} target="_blank" rel="noreferrer">
                    Abrir URL pública
                  </a>
                </div>
                {photoMsg ? <p className="text-xs text-muted">{photoMsg}</p> : null}
              </div>
            </div>
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium">Biografía</label>
            <textarea
              className="min-h-[240px] w-full rounded-xl border border-border bg-background px-3 py-2 text-sm"
              value={bio}
              onChange={(e) => setBio(e.target.value)}
            />
          </div>
        </div>

        <div className="grid gap-4 lg:grid-cols-2">
          <div className="space-y-2">
            <label className="text-sm font-medium">Propuesta / líneas programáticas</label>
            <textarea
              className="min-h-[240px] w-full rounded-xl border border-border bg-background px-3 py-2 text-sm"
              value={proposals}
              onChange={(e) => setProposals(e.target.value)}
            />
          </div>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <div className="grid gap-1">
            <label className="text-sm font-medium">Número de tarjetón (opcional)</label>
            <input
              className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm"
              value={ballotNumber}
              onChange={(e) => setBallotNumber(e.target.value)}
              inputMode="numeric"
              placeholder="ej: 22"
            />
          </div>
          <div className="flex items-end justify-between gap-3 rounded-2xl border border-border bg-background/60 p-4">
            <div>
              <p className="text-sm font-semibold">Automatización</p>
              <p className="text-xs text-muted">
                El auto-blog + auto-publicación se controlan globalmente desde <span className="text-foreground">Admin → Contenido</span>.
              </p>
            </div>
            <div className="text-right">
              <p className="text-xs text-muted">Estado actual (candidato):</p>
              <p className="mt-1 text-xs">
                <span className={politician.auto_blog_enabled ? "text-emerald-300" : "text-rose-300"}>auto_blog={String(politician.auto_blog_enabled)}</span>
                {" · "}
                <span className={politician.auto_publish_enabled ? "text-emerald-300" : "text-rose-300"}>
                  auto_publish={String(politician.auto_publish_enabled)}
                </span>
              </p>
            </div>
          </div>
        </div>

        {profileMsg ? <p className="text-sm text-muted">{profileMsg}</p> : null}
        <button className="glass-button" type="button" onClick={saveProfile} disabled={savingProfile}>
          {savingProfile ? "Guardando…" : "Guardar perfil"}
        </button>
        {deleteMsg ? <p className="text-sm text-amber-300">{deleteMsg}</p> : null}
        <button className="glass-button" type="button" onClick={deleteCandidate} disabled={deleteLoading}>
          {deleteLoading ? "Eliminando…" : "Eliminar candidato"}
        </button>
      </section>

      <section className="glass-card space-y-4 p-6">
        <div className="space-y-1">
          <h2 className="text-base font-semibold">Marketing Hub</h2>
          <p className="text-sm text-muted">
            Archivos (imágenes, videos, PDFs) + generación de blogs para el Centro informativo ciudadano (con revisión humana).
          </p>
        </div>

        <div className="grid gap-4 lg:grid-cols-2">
          <div className="rounded-2xl border border-border bg-background/60 p-4">
            <div className="flex items-center justify-between gap-3">
              <p className="text-sm font-semibold">Zona de archivos</p>
              <button className="glass-button" type="button" onClick={refreshFiles}>
                Ver archivos
              </button>
            </div>
            <p className="mt-1 text-xs text-muted">Sube y copia URLs públicas para embeber en biografía/propuesta o publicaciones.</p>

            <div className="mt-3 grid gap-2">
              <input
                className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm"
                type="file"
                accept="image/*,video/*,application/pdf"
                disabled={uploading}
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) void uploadMedia(f);
                  e.currentTarget.value = "";
                }}
              />
              {uploadMsg ? <p className="text-xs text-muted">{uploadMsg}</p> : null}
            </div>

            <div className="mt-3 grid gap-2">
              {files.map((f) => (
                <div key={f.url} className="flex items-center justify-between gap-3 rounded-xl border border-border bg-background/50 px-3 py-2">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{f.name}</p>
                    <p className="truncate text-xs text-muted">{f.url}</p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <button className="glass-button" type="button" onClick={() => navigator.clipboard.writeText(f.url)}>
                      Copiar URL
                    </button>
                    <button
                      className="glass-button"
                      type="button"
                      onClick={() => void analyzeFileToDraft(f)}
                      disabled={analyzeLoading === f.name}
                    >
                      {analyzeLoading === f.name ? "Analizando…" : "Crear borrador"}
                    </button>
                  </div>
                </div>
              ))}
              {files.length === 0 ? <p className="text-sm text-muted">Sin archivos listados aún.</p> : null}
            </div>
          </div>

          <div className="rounded-2xl border border-border bg-background/60 p-4">
            <p className="text-sm font-semibold">Generación de blogs (Marleny AI)</p>
            <p className="mt-1 text-xs text-muted">
              Genera un borrador basado en noticias recientes por geolocalización (sin scraping de imágenes). Queda en cola de revisión.
            </p>
            {hubMsg ? <p className="mt-3 text-sm text-muted">{hubMsg}</p> : null}
            <div className="mt-3 flex flex-wrap gap-2">
              <button className="glass-button" type="button" onClick={generateNewsBlog} disabled={hubLoading}>
                {hubLoading ? "Generando…" : "Generar blog automático (noticias)"}
              </button>
              <button className="glass-button" type="button" onClick={orchestrateEditorial} disabled={hubLoading}>
                {hubLoading ? "Orquestando…" : "Orquestación editorial (n8n/2-AI)"}
              </button>
              <Link className="glass-button" href={`/admin/content?candidate_id=${encodeURIComponent(politician.id)}`}>
                Ir a cola de revisión
              </Link>
            </div>
            <p className="mt-3 text-xs text-muted">
              Importante: el contenido se publica solo después de aprobación humana, salvo que actives auto-publicación (y guardes el perfil).
            </p>
          </div>
        </div>
      </section>

      <section className="glass-card space-y-4 p-6">
        <div className="space-y-1">
          <h2 className="text-base font-semibold">Enlaces</h2>
          <p className="text-sm text-muted">Redes sociales y páginas web del político.</p>
        </div>

        <div className="grid gap-3 md:grid-cols-4">
          <div className="grid gap-1">
            <label className="text-sm font-medium">Plataforma</label>
            <select
              className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm"
              value={newPlatform}
              onChange={(e) => setNewPlatform(e.target.value)}
            >
              <option value="facebook">facebook</option>
              <option value="instagram">instagram</option>
              <option value="threads">threads</option>
              <option value="tiktok">tiktok</option>
              <option value="x">x</option>
              <option value="youtube">youtube</option>
              <option value="website">website</option>
              <option value="other">other</option>
            </select>
          </div>
          <div className="grid gap-1">
            <label className="text-sm font-medium">Handle (opcional)</label>
            <input
              className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm"
              value={newHandle}
              onChange={(e) => setNewHandle(e.target.value)}
              placeholder="@usuario"
            />
          </div>
          <div className="md:col-span-2 grid gap-1">
            <label className="text-sm font-medium">URL</label>
            <input
              className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm"
              value={newUrl}
              onChange={(e) => setNewUrl(e.target.value)}
              placeholder="https://..."
            />
          </div>
        </div>

        {linkMsg ? <p className="text-sm text-amber-300">{linkMsg}</p> : null}
        <div className="flex flex-wrap gap-2">
          <button className="glass-button" type="button" onClick={addLink}>
            Agregar enlace
          </button>
          <button className="glass-button" type="button" onClick={refreshLinks}>
            Refrescar
          </button>
        </div>

        <div className="grid gap-3 md:grid-cols-2">
          {links.map((l) => (
            <div key={l.id} className="rounded-2xl border border-border bg-background/60 p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold">{l.platform}</p>
                  <p className="mt-1 text-xs text-muted">{l.handle ?? "—"}</p>
                </div>
                <span
                  className={`rounded-full px-3 py-1 text-xs font-semibold ${
                    l.status === "active" ? "bg-emerald-500/15 text-emerald-200" : "bg-zinc-500/15 text-zinc-200"
                  }`}
                >
                  {l.status === "active" ? "Activo" : "Inactivo"}
                </span>
              </div>
              <a className="mt-2 block break-all text-sm text-foreground underline" href={l.url} target="_blank" rel="noreferrer">
                {l.url}
              </a>
              <div className="mt-3 flex gap-2">
                <button className="glass-button" type="button" onClick={() => toggleLinkStatus(l)}>
                  {l.status === "active" ? "Desactivar" : "Activar"}
                </button>
                <button className="glass-button" type="button" onClick={() => deleteLink(l.id)}>
                  Eliminar
                </button>
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="glass-card space-y-4 p-6">
        <div className="space-y-1">
          <h2 className="text-base font-semibold">Publicaciones</h2>
          <p className="text-sm text-muted">
            Crea publicaciones por red. El político aprueba o rechaza desde su enlace exclusivo.
          </p>
        </div>

        <div className="grid gap-3 lg:grid-cols-2">
          <div className="grid gap-3">
            <div className="grid gap-1">
              <label className="text-sm font-medium">Plataforma</label>
              <select
                className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm"
                value={pubPlatform}
                onChange={(e) => setPubPlatform(e.target.value)}
              >
                <option value="multi">multi (FB/IG/X)</option>
                <option value="facebook">facebook</option>
                <option value="instagram">instagram</option>
                <option value="threads">threads</option>
                <option value="tiktok">tiktok</option>
                <option value="x">x</option>
              </select>
            </div>
            <div className="grid gap-1">
              <label className="text-sm font-medium">Título (opcional)</label>
              <input
                className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm"
                value={pubTitle}
                onChange={(e) => setPubTitle(e.target.value)}
              />
            </div>
            <div className="grid gap-1">
              <label className="text-sm font-medium">Contenido</label>
              <textarea
                className="min-h-[160px] w-full rounded-xl border border-border bg-background px-3 py-2 text-sm"
                value={pubContent}
                onChange={(e) => setPubContent(e.target.value)}
              />
            </div>

            <div className="rounded-2xl border border-border bg-background/60 p-4">
              <div className="flex items-center justify-between gap-3">
                <p className="text-sm font-semibold">Variantes (FB / IG / X)</p>
                <div className="flex flex-wrap gap-2">
                  <button
                    className="glass-button"
                    type="button"
                    onClick={async () => {
                      await loadLatestDraftIntoPublication();
                    }}
                    disabled={loadingFromDraft}
                    title="Trae el último borrador de la cola (ai_drafts) y llena base + variantes"
                  >
                    {loadingFromDraft ? "Cargando borrador…" : "Cargar último borrador"}
                  </button>
                  <button
                    className="glass-button"
                    type="button"
                    onClick={() => {
                      const base = pubContent.trim();
                      const computed = ensureSocialVariants({
                        baseText: base,
                        blogText: base,
                        variants: null,
                        seo_keywords: (politician as any)?.seo_keywords ?? [],
                        candidate: { name, ballot_number: ballotNumber.trim() ? ballotNumber.trim() : politician.ballot_number ?? null },
                      });
                      setPubVariants({ facebook: computed.facebook, instagram: computed.instagram, x: computed.x });
                    }}
                    disabled={!pubContent.trim()}
                  >
                    Autogenerar desde base
                  </button>
                </div>
              </div>
              <div className="mt-3 grid gap-3 md:grid-cols-3">
                <textarea
                  className="min-h-[110px] w-full rounded-xl border border-border bg-background px-3 py-2 text-sm"
                  value={pubVariants?.facebook ?? ""}
                  onChange={(e) => setPubVariants({ ...(pubVariants ?? { facebook: "", instagram: "", x: "" }), facebook: e.target.value })}
                  placeholder="Facebook"
                />
                <textarea
                  className="min-h-[110px] w-full rounded-xl border border-border bg-background px-3 py-2 text-sm"
                  value={pubVariants?.instagram ?? ""}
                  onChange={(e) => setPubVariants({ ...(pubVariants ?? { facebook: "", instagram: "", x: "" }), instagram: e.target.value })}
                  placeholder="Instagram"
                />
                <textarea
                  className="min-h-[110px] w-full rounded-xl border border-border bg-background px-3 py-2 text-sm"
                  value={pubVariants?.x ?? ""}
                  onChange={(e) => setPubVariants({ ...(pubVariants ?? { facebook: "", instagram: "", x: "" }), x: e.target.value })}
                  placeholder="X (280)"
                />
              </div>
              <p className="mt-2 text-xs text-muted">Estas variantes se enviarán a n8n cuando el contenido esté aprobado.</p>
            </div>

            <div className="grid gap-3 md:grid-cols-2">
              <div className="grid gap-1">
                <label className="text-sm font-medium">Rotación sugerida (días)</label>
                <input
                  className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm"
                  value={pubRotationDays}
                  onChange={(e) => setPubRotationDays(e.target.value)}
                  inputMode="numeric"
                />
              </div>
              <div className="grid gap-1">
                <label className="text-sm font-medium">Expira (opcional)</label>
                <input
                  className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm"
                  value={pubExpiresAt}
                  onChange={(e) => setPubExpiresAt(e.target.value)}
                  placeholder="YYYY-MM-DD"
                />
              </div>
            </div>
            <div className="grid gap-1">
              <label className="text-sm font-medium">Media URLs (coma-separado, opcional)</label>
              <input
                className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm"
                value={pubMedia}
                onChange={(e) => setPubMedia(e.target.value)}
                placeholder="https://...jpg, https://...mp4"
              />
              {(() => {
                const urls = pubMedia
                  .split(",")
                  .map((s) => s.trim())
                  .filter(Boolean);
                if (!urls.length) return null;
                return (
                  <div className="mt-2 grid gap-2">
                    {urls.map((u) => (
                      <div key={u} className="flex items-center justify-between gap-2 rounded-xl border border-border bg-background/50 px-3 py-2">
                        <p className="min-w-0 truncate text-xs text-muted">{u}</p>
                        <div className="flex shrink-0 gap-2">
                          <button className="glass-button" type="button" onClick={() => navigator.clipboard.writeText(u)} title="Copiar URL">
                            Copiar
                          </button>
                          <button className="glass-button" type="button" onClick={() => removeMediaUrl(u)} title="Quitar de la publicación">
                            Quitar
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                );
              })()}
            </div>

            <div className="grid gap-2">
              <label className="text-sm font-medium">Subir imagen / video</label>
              <input
                className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm"
                type="file"
                accept="image/*,video/*"
                disabled={uploading}
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) void uploadMedia(f);
                  e.currentTarget.value = "";
                }}
              />
              {uploadMsg ? <p className="text-xs text-muted">{uploadMsg}</p> : null}
            </div>

            {pubMsg ? <p className="text-sm text-amber-300">{pubMsg}</p> : null}
            <button className="glass-button" type="button" onClick={createPublication} disabled={creatingPub}>
              {creatingPub ? "Creando…" : "Crear (pendiente de aprobación)"}
            </button>
          </div>

          <div className="grid gap-3">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-semibold">Últimas</p>
                <p className="mt-1 text-xs text-muted">
                  pendientes={pubCounts.pending_approval ?? 0} · aprobadas={pubCounts.approved ?? 0} · rechazadas={pubCounts.rejected ?? 0}
                </p>
              </div>
              <button className="glass-button" type="button" onClick={refreshPublications}>
                Refrescar
              </button>
            </div>
            <div className="flex flex-wrap gap-2">
              {(
                [
                  { k: "all", label: "Todas" },
                  { k: "pending_approval", label: "Pendientes" },
                  { k: "approved", label: "Aprobadas" },
                  { k: "rejected", label: "Rechazadas" },
                ] as const
              ).map((x) => (
                <button
                  key={x.k}
                  className={`glass-button ${pubListMode === x.k ? "border-amber-300/40 bg-amber-300/12" : ""}`}
                  type="button"
                  onClick={() => setPubListMode(x.k)}
                >
                  {x.label}
                </button>
              ))}
            </div>
            {publications.map((p) => (
              pubListMode !== "all" && p.status !== pubListMode ? null : (
              <div key={p.id} className="rounded-2xl border border-border bg-background/60 p-4">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="text-sm font-semibold">{p.platform}</p>
                    <p className="mt-1 text-xs text-muted">
                      Estado:{" "}
                      <span
                        className={
                          p.status === "approved"
                            ? "text-emerald-300"
                            : p.status === "rejected"
                              ? "text-rose-300"
                              : p.status === "pending_approval"
                                ? "text-amber-300"
                                : "text-muted"
                        }
                      >
                        {p.status}
                      </span>
                    </p>
                  </div>
                  <p className="text-xs text-muted">{new Date(p.created_at).toLocaleString("es-CO")}</p>
                </div>
                {p.title ? <p className="mt-2 text-sm font-medium">{p.title}</p> : null}
                <p className="mt-2 whitespace-pre-wrap text-sm text-muted">{p.content}</p>
                {p.variants && typeof p.variants === "object" && Object.keys(p.variants).length ? (
                  <details className="mt-3 rounded-xl border border-border bg-background/50 p-3">
                    <summary className="cursor-pointer text-sm font-medium">Ver variantes</summary>
                    <pre className="mt-2 whitespace-pre-wrap text-xs text-muted">{JSON.stringify(p.variants, null, 2)}</pre>
                  </details>
                ) : null}
                {p.media_urls?.length ? (
                  <ul className="mt-3 list-disc space-y-1 pl-5 text-xs text-muted">
                    {p.media_urls.map((u) => (
                      <li key={u} className="break-all">
                        {u}
                      </li>
                    ))}
                  </ul>
                ) : null}
                <div className="mt-3 flex flex-wrap gap-2">
                  <button
                    className="glass-button"
                    type="button"
                    disabled={p.status !== "approved"}
                    onClick={() => sendPublicationToAutomation(p)}
                  >
                    Enviar a automatización
                  </button>
                </div>
                {p.decided_at ? (
                  <p className="mt-3 text-xs text-muted">Decisión: {new Date(p.decided_at).toLocaleString("es-CO")}</p>
                ) : null}
              </div>
              )
            ))}
            {publications.length === 0 ? <p className="text-sm text-muted">Aún no hay publicaciones.</p> : null}
          </div>
        </div>
      </section>

      <section className="glass-card space-y-4 p-6">
        <div className="space-y-1">
          <h2 className="text-base font-semibold">Enlace móvil (político)</h2>
          <p className="text-sm text-muted">
            Genera un enlace exclusivo para que el político apruebe o rechace publicaciones desde su celular.
          </p>
        </div>

        {accessMsg ? <p className="text-sm text-amber-300">{accessMsg}</p> : null}
        <button className="glass-button" type="button" onClick={generateAccessLink} disabled={accessLoading}>
          {accessLoading ? "Generando…" : "Generar enlace exclusivo"}
        </button>

        {accessLink ? (
          <div className="rounded-xl border border-border bg-background/50 p-4">
            <p className="text-sm font-semibold">Enlace (cópialo y envíalo al político)</p>
            <div className="mt-2 break-all rounded-lg border border-border bg-background px-3 py-2 font-mono text-xs">
              {accessLink}
            </div>
          </div>
        ) : null}
      </section>
    </div>
  );
}

