"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";

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
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);

  const initialSnapshot = useMemo(
    () => ({
      bio: politician.biography ?? "",
      proposals: politician.proposals ?? "",
      ballotNumber: politician.ballot_number ? String(politician.ballot_number) : "",
    }),
    [politician.ballot_number, politician.biography, politician.proposals]
  );

  const [bio, setBio] = useState(initialSnapshot.bio);
  const [proposals, setProposals] = useState(initialSnapshot.proposals);
  const [ballotNumber, setBallotNumber] = useState<string>(initialSnapshot.ballotNumber);
  const [savingProfile, setSavingProfile] = useState(false);
  const [profileMsg, setProfileMsg] = useState<string | null>(null);
  const [savedSnapshot, setSavedSnapshot] = useState(initialSnapshot);

  const hasUnsavedProfileChanges =
    bio !== savedSnapshot.bio || proposals !== savedSnapshot.proposals || ballotNumber !== savedSnapshot.ballotNumber;

  const [links, setLinks] = useState<SocialLink[]>(initialLinks);
  const [newPlatform, setNewPlatform] = useState("facebook");
  const [newHandle, setNewHandle] = useState("");
  const [newUrl, setNewUrl] = useState("");
  const [linkMsg, setLinkMsg] = useState<string | null>(null);

  const [publications, setPublications] = useState<Publication[]>(initialPublications);
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

  const [accessMsg, setAccessMsg] = useState<string | null>(null);
  const [accessLink, setAccessLink] = useState<string | null>(null);
  const [accessLoading, setAccessLoading] = useState(false);

  const [hubMsg, setHubMsg] = useState<string | null>(null);
  const [hubLoading, setHubLoading] = useState(false);
  const [files, setFiles] = useState<{ name: string; url: string }[]>([]);

  async function refreshPublications() {
    if (!supabase) return;
    const { data } = await supabase
      .from("politician_publications")
      .select("id,platform,title,content,variants,media_urls,status,rotation_window_days,expires_at,created_at,updated_at,decided_at,decision_notes")
      .eq("politician_id", politician.id)
      .order("created_at", { ascending: false })
      .limit(50);
    if (data) setPublications(data as Publication[]);
  }

  async function refreshLinks() {
    if (!supabase) return;
    const { data } = await supabase
      .from("politician_social_links")
      .select("id,platform,handle,url,status,created_at")
      .eq("politician_id", politician.id)
      .order("created_at", { ascending: true });
    if (data) setLinks(data as SocialLink[]);
  }

  async function saveProfile() {
    setProfileMsg(null);
    if (!supabase) {
      setProfileMsg("Supabase no está configurado en este entorno.");
      return;
    }
    setSavingProfile(true);
    const bn = ballotNumber.trim() ? Number(ballotNumber.trim()) : null;
    const { error } = await supabase
      .from("politicians")
      .update({
        biography: bio,
        proposals,
        ballot_number: Number.isFinite(bn as number) ? (bn as number) : null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", politician.id);
    setSavingProfile(false);
    if (error) {
      setProfileMsg("No fue posible guardar.");
      return;
    }
    setProfileMsg("Guardado.");
    setSavedSnapshot({ bio, proposals, ballotNumber });
  }

  async function addLink() {
    setLinkMsg(null);
    if (!supabase) {
      setLinkMsg("Supabase no está configurado en este entorno.");
      return;
    }
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
    const { error } = await supabase.from("politician_social_links").insert({
      politician_id: politician.id,
      platform: newPlatform,
      handle: newHandle.trim() ? newHandle.trim() : null,
      url,
      status: "active",
    });
    if (error) {
      setLinkMsg("No fue posible agregar el enlace.");
      return;
    }
    setNewHandle("");
    setNewUrl("");
    await refreshLinks();
  }

  async function deleteLink(id: string) {
    setLinkMsg(null);
    if (!supabase) return;
    const { error } = await supabase.from("politician_social_links").delete().eq("id", id);
    if (error) {
      setLinkMsg("No fue posible eliminar el enlace.");
      return;
    }
    await refreshLinks();
  }

  async function toggleLinkStatus(link: SocialLink) {
    setLinkMsg(null);
    if (!supabase) return;
    const next = link.status === "active" ? "inactive" : "active";
    const { error } = await supabase.from("politician_social_links").update({ status: next }).eq("id", link.id);
    if (error) {
      setLinkMsg("No fue posible actualizar el estado.");
      return;
    }
    await refreshLinks();
  }

  async function createPublication() {
    setPubMsg(null);
    if (!supabase) {
      setPubMsg("Supabase no está configurado en este entorno.");
      return;
    }

    const content = pubContent.trim();
    if (!content) {
      setPubMsg("Contenido requerido.");
      return;
    }

    const media_urls = pubMedia
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);

    const rotation = pubRotationDays.trim() ? Number(pubRotationDays) : null;
    const expires_at = pubExpiresAt.trim() ? new Date(pubExpiresAt).toISOString() : null;

    setCreatingPub(true);
    const { data: me } = await supabase.auth.getUser();
    const created_by = me.user?.id ?? null;

    const { error } = await supabase.from("politician_publications").insert({
      politician_id: politician.id,
      platform: pubPlatform,
      title: pubTitle.trim() ? pubTitle.trim() : null,
      content,
      variants: pubVariants ?? {},
      media_urls: media_urls.length ? media_urls : null,
      status: "pending_approval",
      rotation_window_days: Number.isFinite(rotation as number) ? rotation : null,
      expires_at,
      created_by,
      updated_at: new Date().toISOString(),
    });

    setCreatingPub(false);

    if (error) {
      setPubMsg("No fue posible crear la publicación.");
      return;
    }

    setPubTitle("");
    setPubContent("");
    setPubMedia("");
    setPubVariants(null);
    await refreshPublications();
  }

  function sanitizeFilename(name: string): string {
    const base = name.normalize("NFKD").replaceAll(/[^\w.\-]+/g, "-");
    return base.length ? base.slice(0, 120) : "file";
  }

  async function uploadMedia(file: File) {
    setUploadMsg(null);
    if (!supabase) {
      setUploadMsg("Supabase no está configurado en este entorno.");
      return;
    }
    setUploading(true);
    const filename = sanitizeFilename(file.name);
    const path = `${politician.id}/${Date.now()}-${filename}`;

    const { error } = await supabase.storage.from("politician-media").upload(path, file, {
      cacheControl: "3600",
      upsert: false,
      contentType: file.type || undefined,
    });

    if (error) {
      setUploading(false);
      setUploadMsg("No fue posible subir el archivo (verifica bucket/políticas).");
      return;
    }

    const { data } = supabase.storage.from("politician-media").getPublicUrl(path);
    const url = data.publicUrl;
    setUploading(false);

    // Append to media field (comma-separated)
    setPubMedia((prev) => {
      const next = prev.trim();
      return next ? `${next}, ${url}` : url;
    });
    setUploadMsg("Archivo subido. Se agregó el URL al campo de media.");
  }

  async function refreshFiles() {
    setHubMsg(null);
    if (!supabase) return;
    const { data, error } = await supabase.storage.from("politician-media").list(politician.id, {
      limit: 50,
      sortBy: { column: "created_at", order: "desc" },
    });
    if (error || !data) return;
    const next = data
      .filter((o) => o.name && !o.name.endsWith("/"))
      .map((o) => {
        const path = `${politician.id}/${o.name}`;
        const { data: u } = supabase.storage.from("politician-media").getPublicUrl(path);
        return { name: o.name, url: u.publicUrl };
      });
    setFiles(next);
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
          <div className="space-y-2">
            <label className="text-sm font-medium">Biografía</label>
            <textarea
              className="min-h-[240px] w-full rounded-xl border border-border bg-background px-3 py-2 text-sm"
              value={bio}
              onChange={(e) => setBio(e.target.value)}
            />
          </div>
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
                  <button className="glass-button" type="button" onClick={() => navigator.clipboard.writeText(f.url)}>
                    Copiar URL
                  </button>
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
              <Link className="glass-button" href="/admin/content">
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
                <button
                  className="glass-button"
                  type="button"
                  onClick={() =>
                    setPubVariants({
                      facebook: pubContent,
                      instagram: pubContent,
                      x: pubContent.slice(0, 280),
                    })
                  }
                >
                  Autogenerar desde base
                </button>
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
              <p className="text-sm font-semibold">Últimas</p>
              <button className="glass-button" type="button" onClick={refreshPublications}>
                Refrescar
              </button>
            </div>
            {publications.map((p) => (
              <div key={p.id} className="rounded-2xl border border-border bg-background/60 p-4">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="text-sm font-semibold">{p.platform}</p>
                    <p className="mt-1 text-xs text-muted">Estado: {p.status}</p>
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

