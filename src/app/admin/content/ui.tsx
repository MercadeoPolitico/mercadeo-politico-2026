"use client";

import { useEffect, useMemo, useState } from "react";
import type { ContentType, GenerateResponse } from "@/lib/automation/types";

type Draft = {
  id: string;
  candidate_id: string;
  content_type: ContentType | string;
  topic: string;
  tone: string | null;
  generated_text: string;
  variants?: {
    facebook: string;
    instagram: string;
    x: string;
  };
  metadata?: Record<string, unknown> | null;
  status: string;
  reviewer_notes: string | null;
  rotation_window_days: number | null;
  expires_at: string | null;
  image_keywords: string[] | null;
  created_at: string;
};

type LoadState = "idle" | "loading" | "ready" | "error";

export function AdminContentPanel() {
  const [drafts, setDrafts] = useState<Draft[]>([]);
  const [loadState, setLoadState] = useState<LoadState>("loading");
  const [selected, setSelected] = useState<Draft | null>(null);
  const [polById, setPolById] = useState<Record<string, { name: string; office: string; region: string }>>({});
  const [checked, setChecked] = useState<Record<string, boolean>>({});
  const [bulkAllowNoImage, setBulkAllowNoImage] = useState<boolean>(false);

  // Draft creation (generate + store)
  const [candidateId, setCandidateId] = useState("jose-angel-martinez");
  const [contentType, setContentType] = useState<ContentType>("blog");
  const [topic, setTopic] = useState("");
  const [tone, setTone] = useState("");
  const [rotationDays, setRotationDays] = useState<string>("7");
  const [expiresAt, setExpiresAt] = useState<string>("");
  const [imageKeywords, setImageKeywords] = useState<string>("");
  const [genState, setGenState] = useState<"idle" | "loading" | "done" | "error">("idle");
  const [genResult, setGenResult] = useState<GenerateResponse | null>(null);
  const [variants, setVariants] = useState<{ facebook: string; instagram: string; x: string } | null>(null);
  const [genErrorMsg, setGenErrorMsg] = useState<string>("");

  const [imageState, setImageState] = useState<"idle" | "loading" | "done" | "error">("idle");
  const [imageErrorMsg, setImageErrorMsg] = useState<string>("");

  const canGenerate = useMemo(() => topic.trim().length > 0 && candidateId.trim().length > 0, [topic, candidateId]);

  async function refresh() {
    setLoadState("loading");
    const res = await fetch("/api/admin/drafts", { method: "GET" });
    if (!res.ok) {
      setLoadState("error");
      return;
    }
    const json = (await res.json()) as { ok: boolean; drafts: Draft[] };
    setDrafts(json.drafts ?? []);
    setLoadState("ready");
    // Drop selections for rows no longer present.
    const ids = new Set((json.drafts ?? []).map((d) => d.id));
    setChecked((prev) => {
      const next: Record<string, boolean> = {};
      for (const [k, v] of Object.entries(prev)) {
        if (v && ids.has(k)) next[k] = true;
      }
      return next;
    });
  }

  useEffect(() => {
    let cancelled = false;
    // Load politicians for nicer labels (name/region), best-effort.
    fetch("/api/admin/politicians/list", { method: "GET" })
      .then(async (res) => {
        if (cancelled) return;
        if (!res.ok) return;
        const json = (await res.json().catch(() => null)) as any;
        const rows = Array.isArray(json?.politicians) ? (json.politicians as any[]) : [];
        const map: Record<string, { name: string; office: string; region: string }> = {};
        for (const r of rows) {
          if (!r || typeof r !== "object") continue;
          const id = typeof (r as any).id === "string" ? String((r as any).id) : "";
          if (!id) continue;
          map[id] = {
            name: typeof (r as any).name === "string" ? String((r as any).name) : id,
            office: typeof (r as any).office === "string" ? String((r as any).office) : "",
            region: typeof (r as any).region === "string" ? String((r as any).region) : "",
          };
        }
        setPolById(map);
      })
      .catch(() => {});

    fetch("/api/admin/drafts", { method: "GET" })
      .then(async (res) => {
        if (cancelled) return;
        if (!res.ok) {
          setLoadState("error");
          return;
        }
        const json = (await res.json()) as { ok: boolean; drafts: Draft[] };
        if (cancelled) return;
        setDrafts(json.drafts ?? []);
        setLoadState("ready");
      })
      .catch(() => {
        if (!cancelled) setLoadState("error");
      });

    return () => {
      cancelled = true;
    };
  }, []);

  async function generate() {
    if (!canGenerate) return;
    setGenState("loading");
    setGenResult(null);
    setGenErrorMsg("");

    const payload = {
      candidate_id: candidateId.trim(),
      content_type: contentType,
      topic: topic.trim(),
      tone: tone.trim() ? tone.trim() : undefined,
    };

    const res = await fetch("/api/admin/automation/generate", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      const j = (await res.json().catch(() => null)) as any;
      const err = typeof j?.error === "string" ? j.error : "upstream_error";
      const metaEng = j?.meta?.engines;
      const act = metaEng?.Actuation;
      const vol = metaEng?.Volume;
      const safeDiag =
        act || vol ? ` Diagnóstico (safe): Actuation=${String(act ?? "n/a")} · Volume=${String(vol ?? "n/a")}` : "";
      setGenErrorMsg(`Falló generación: ${err}.${safeDiag}`);
      setGenState("error");
      return;
    }

    const data = (await res.json()) as GenerateResponse;
    setGenResult(data);
    setVariants(data.variants ?? null);
    if (Array.isArray(data.image_keywords) && data.image_keywords.length) {
      setImageKeywords(data.image_keywords.join(", "));
    }
    setGenState("done");
  }

  function isImageReady(d: Draft): boolean {
    const meta = (d.metadata ?? null) as any;
    if (meta && meta.image_ready === true) return true;
    const url = meta && (typeof meta.image_url === "string" ? meta.image_url : meta?.image_metadata?.url);
    return typeof url === "string" && url.trim().length > 0;
  }

  function imageUrlOf(d: Draft): string | null {
    const meta = (d.metadata ?? null) as any;
    const url =
      (meta && typeof meta.image_url === "string" && meta.image_url) ||
      (meta && typeof meta?.image_metadata?.url === "string" && meta.image_metadata.url) ||
      null;
    return url ? String(url).trim() : null;
  }

  function titleFromText(text: string): string {
    const lines = String(text || "").split("\n").map((l) => l.trim());
    return (lines.find((l) => l.length > 0) ?? "").slice(0, 160);
  }

  function hostOf(u: string): string | null {
    try {
      return new URL(u).host;
    } catch {
      return null;
    }
  }

  function authorFromDraft(d: Draft): string | null {
    const meta = (d.metadata ?? null) as any;
    const name = meta && typeof meta.source_name === "string" ? String(meta.source_name).trim() : "";
    if (name) return name;
    const url = meta && typeof meta.source_url === "string" ? String(meta.source_url).trim() : "";
    return url ? hostOf(url) : null;
  }

  function allowNoImage(d: Draft): boolean {
    const meta = (d.metadata ?? null) as any;
    return meta && meta.allow_no_image === true;
  }

  function validateForPublish(d: Draft, opts?: { allow_no_image?: boolean }): { ok: true } | { ok: false; reason: string } {
    const title = titleFromText(d.generated_text);
    if (!title) return { ok: false, reason: "Falta título (primera línea del texto)." };
    const author = authorFromDraft(d);
    if (!author) return { ok: false, reason: "Falta autor/medio (source_name/source_url)." };
    const hasImg = Boolean(imageUrlOf(d));
    const allow = opts?.allow_no_image === true || allowNoImage(d);
    if (!hasImg && !allow) return { ok: false, reason: "Falta imagen (o autoriza 'sin imagen')." };
    return { ok: true };
  }

  async function generateImageForSelected() {
    if (!selected) return;
    setImageState("loading");
    setImageErrorMsg("");

    const res = await fetch("/api/admin/drafts/generate-image", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ draft_id: selected.id, image_keywords: selected.image_keywords ?? undefined }),
    });

    const j = (await res.json().catch(() => null)) as any;
    if (!res.ok || !j?.ok) {
      const reason = typeof j?.reason === "string" ? j.reason : typeof j?.error === "string" ? j.error : "upstream_error";
      setImageErrorMsg(`Image generation failed: ${reason}`);
      setImageState("error");
      await refresh();
      return;
    }

    setImageState("done");
    await refresh();
  }

  async function saveDraft() {
    if (!genResult) return;

    const rotation = rotationDays.trim() ? Number(rotationDays) : null;
    const keywords = imageKeywords
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);

    const body = {
      candidate_id: genResult.candidate_id,
      content_type: genResult.content_type,
      topic: topic.trim(),
      tone: tone.trim() ? tone.trim() : null,
      generated_text: genResult.generated_text,
      variants: variants ?? null,
      status: "pending_review",
      rotation_window_days: Number.isFinite(rotation as number) ? rotation : null,
      expires_at: expiresAt.trim() ? new Date(expiresAt).toISOString() : null,
      image_keywords: keywords.length ? keywords : null,
      metadata: { token_estimate: genResult.token_estimate },
      source: "web",
    };

    const res = await fetch("/api/admin/drafts", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });

    if (!res.ok) return;
    await refresh();
    setTopic("");
    setTone("");
    setGenResult(null);
    setVariants(null);
    setGenState("idle");
  }

  async function updateDraft(patch: Partial<Draft> & { id: string }) {
    const res = await fetch("/api/admin/drafts", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(patch),
    });
    if (!res.ok) return false;
    await refresh();
    return true;
  }

  async function deleteDraft(draft: Draft) {
    const ok = window.confirm(
      "Vas a ELIMINAR este borrador. Esta acción no se puede deshacer. ¿Deseas continuar?"
    );
    if (!ok) return;

    const res = await fetch("/api/admin/drafts", {
      method: "DELETE",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ id: draft.id }),
    });
    if (!res.ok) return;
    await refresh();
    setSelected(null);
  }

  function getPublishedRef(draft: Draft): { post_id: string | null; slug: string | null } {
    const meta = (draft.metadata ?? null) as Record<string, unknown> | null;
    const post_id = meta && typeof meta.published_post_id === "string" ? meta.published_post_id : null;
    const slug = meta && typeof meta.published_slug === "string" ? meta.published_slug : null;
    return { post_id, slug };
  }

  async function managePublishedPost(draft: Draft, action: "archive" | "delete") {
    const ref = getPublishedRef(draft);
    if (!ref.post_id && !ref.slug) return;

    const msg =
      action === "archive"
        ? "Vas a DESPUBLICAR esta noticia del Centro Informativo (ya no será visible al público). ¿Continuar?"
        : "Vas a ELIMINAR definitivamente esta noticia del Centro Informativo. Esta acción no se puede deshacer. ¿Continuar?";
    const ok = window.confirm(msg);
    if (!ok) return;

    const res = await fetch("/api/admin/news/manage", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        action,
        draft_id: draft.id,
        post_id: ref.post_id ?? undefined,
        slug: ref.slug ?? undefined,
      }),
    });
    if (!res.ok) return;
    await refresh();
  }

  async function sendToN8n(draft: Draft) {
    // Only allow for approved drafts (human-gated)
    if (draft.status !== "approved") return;

    const res = await fetch("/api/admin/automation/submit", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        candidate_id: draft.candidate_id,
        content_type: draft.content_type,
        generated_text: draft.generated_text,
        token_estimate: 0,
        created_at: draft.created_at,
        source: "web",
        metadata: {
          variants: draft.variants ?? undefined,
          rotation_window_days: draft.rotation_window_days,
          expires_at: draft.expires_at,
          image_keywords: draft.image_keywords,
        },
      }),
    });

    if (!res.ok) return;
    await updateDraft({ id: draft.id, status: "sent_to_n8n" });
  }

  async function publishToCitizenCenter(draft: Draft) {
    if (draft.content_type !== "blog") return;
    if (draft.status !== "approved" && draft.status !== "edited") return;
    const res = await fetch("/api/admin/news/publish", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ draft_id: draft.id }),
    });
    if (!res.ok) return;
    await refresh();
  }

  const selectedIds = useMemo(() => Object.keys(checked).filter((k) => checked[k]), [checked]);
  const selectedDrafts = useMemo(() => drafts.filter((d) => selectedIds.includes(d.id)), [drafts, selectedIds]);
  const bulkHasSelection = selectedIds.length > 0;

  function toggleChecked(id: string) {
    setChecked((prev) => ({ ...prev, [id]: !prev[id] }));
  }

  function clearSelection() {
    setChecked({});
  }

  async function bulkDelete() {
    if (!bulkHasSelection) return;
    const ok = window.confirm(`Vas a ELIMINAR ${selectedIds.length} borradores. Esta acción no se puede deshacer. ¿Continuar?`);
    if (!ok) return;
    for (const id of selectedIds) {
      // eslint-disable-next-line no-await-in-loop
      await fetch("/api/admin/drafts", { method: "DELETE", headers: { "content-type": "application/json" }, body: JSON.stringify({ id }) });
    }
    clearSelection();
    await refresh();
  }

  async function bulkPublishCitizen() {
    if (!bulkHasSelection) return;
    const ok = window.confirm(`Publicar ${selectedIds.length} borradores en Centro Informativo (los inválidos se omiten). ¿Continuar?`);
    if (!ok) return;
    let okCount = 0;
    let skipCount = 0;
    for (const d of selectedDrafts) {
      if (d.content_type !== "blog") {
        skipCount++;
        // eslint-disable-next-line no-continue
        continue;
      }
      if (d.status !== "approved" && d.status !== "edited") {
        skipCount++;
        // eslint-disable-next-line no-continue
        continue;
      }
      const v = validateForPublish(d, { allow_no_image: bulkAllowNoImage });
      if (!v.ok) {
        skipCount++;
        // eslint-disable-next-line no-continue
        continue;
      }
      // eslint-disable-next-line no-await-in-loop
      const res = await fetch("/api/admin/news/publish", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ draft_id: d.id, allow_no_image: bulkAllowNoImage }),
      });
      if (res.ok) okCount++;
      else skipCount++;
    }
    window.alert(`Centro Informativo: publicados=${okCount} · omitidos=${skipCount}`);
    await refresh();
  }

  async function bulkSendToApprovedNetworks() {
    if (!bulkHasSelection) return;
    const ok = window.confirm(`Enviar ${selectedIds.length} borradores a redes (ruteo automático por autorizaciones). ¿Continuar?`);
    if (!ok) return;
    let okCount = 0;
    let skipCount = 0;
    for (const d of selectedDrafts) {
      if (d.status !== "approved" && d.status !== "edited") {
        skipCount++;
        // eslint-disable-next-line no-continue
        continue;
      }
      const v = validateForPublish(d, { allow_no_image: bulkAllowNoImage });
      if (!v.ok) {
        skipCount++;
        // eslint-disable-next-line no-continue
        continue;
      }
      // eslint-disable-next-line no-await-in-loop
      const res = await fetch("/api/admin/automation/publish-to-n8n", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ draft_id: d.id, allow_no_image: bulkAllowNoImage }),
      });
      const j = (await res.json().catch(() => null)) as any;
      if (res.ok && j?.ok) okCount++;
      else skipCount++;
    }
    window.alert(`Redes (aprobadas): enviados=${okCount} · omitidos=${skipCount}`);
    await refresh();
  }

  async function sendDraftToApprovedNetworks(draft: Draft) {
    if (draft.status !== "approved" && draft.status !== "edited") return;
    const v = validateForPublish(draft);
    if (!v.ok) {
      window.alert(`No se puede enviar: ${v.reason}`);
      return;
    }
    const ok = window.confirm(
      "Esto enviará el borrador a n8n SOLO para redes aprobadas (autorizadas por el dueño). ¿Continuar?"
    );
    if (!ok) return;

    const res = await fetch("/api/admin/automation/publish-to-n8n", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ draft_id: draft.id, allow_no_image: allowNoImage(draft) }),
    });
    const j = (await res.json().catch(() => null)) as any;
    if (!res.ok || !j?.ok) {
      const err = typeof j?.error === "string" ? j.error : "upstream_error";
      const msg =
        err === "no_approved_networks"
          ? "No hay redes aprobadas para este candidato. Ve a Admin → n8n / Redes y envía enlaces por WhatsApp."
          : `No se pudo enviar a redes: ${err}`;
      window.alert(msg);
      await refresh();
      return;
    }
    await refresh();
    window.alert(`Enviado a n8n. Redes aprobadas: ${j?.destinations_count ?? "—"}`);
  }

  return (
    <div className="space-y-8">
      <div className="glass-card p-6">
        <h3 className="text-base font-semibold">Generar borrador</h3>
        <div className="mt-4 grid gap-4 lg:grid-cols-2">
          <div className="grid gap-3">
            <div className="grid gap-1">
              <label className="text-sm font-medium">Candidate ID</label>
              <input
                className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm"
                value={candidateId}
                onChange={(e) => setCandidateId(e.target.value)}
              />
            </div>
            <div className="grid gap-1">
              <label className="text-sm font-medium">Tipo</label>
              <select
                className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm"
                value={contentType}
                onChange={(e) => setContentType(e.target.value as ContentType)}
              >
                <option value="blog">blog</option>
                <option value="proposal">proposal</option>
                <option value="social">social</option>
              </select>
            </div>
            <div className="grid gap-1">
              <label className="text-sm font-medium">Tema</label>
              <textarea
                className="min-h-[110px] w-full rounded-xl border border-border bg-background px-3 py-2 text-sm"
                value={topic}
                onChange={(e) => setTopic(e.target.value)}
                maxLength={160}
              />
            </div>
            <div className="grid gap-1">
              <label className="text-sm font-medium">Tono (opcional)</label>
              <input
                className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm"
                value={tone}
                onChange={(e) => setTone(e.target.value)}
                maxLength={80}
              />
            </div>
          </div>

          <div className="grid gap-3">
            <div className="grid gap-1">
              <label className="text-sm font-medium">Rotación sugerida (días)</label>
              <input
                className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm"
                value={rotationDays}
                onChange={(e) => setRotationDays(e.target.value)}
                inputMode="numeric"
              />
            </div>
            <div className="grid gap-1">
              <label className="text-sm font-medium">Expira (opcional)</label>
              <input
                className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm"
                value={expiresAt}
                onChange={(e) => setExpiresAt(e.target.value)}
                placeholder="YYYY-MM-DD"
              />
              <p className="text-xs text-muted">Solo metadata; no scheduler.</p>
            </div>
            <div className="grid gap-1">
              <label className="text-sm font-medium">Keywords de imagen (coma-separado)</label>
              <input
                className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm"
                value={imageKeywords}
                onChange={(e) => setImageKeywords(e.target.value)}
                placeholder="ej.: llanos, villavicencio, meta, congreso"
              />
              <p className="text-xs text-muted">Sugerencias únicamente; no scraping.</p>
            </div>

            <button className="glass-button w-full" onClick={generate} disabled={!canGenerate || genState === "loading"}>
              {genState === "loading" ? "Generando…" : "Generar con Marleny"}
            </button>
          </div>
        </div>

        {genState === "error" ? <p className="mt-3 text-sm text-amber-300">{genErrorMsg || "Falló generación."}</p> : null}

        {genResult ? (
          <div className="mt-4 space-y-3">
            <div className="rounded-xl border border-border bg-background p-4">
              <pre className="whitespace-pre-wrap text-sm">{genResult.generated_text}</pre>
            </div>
            {variants ? (
              <div className="grid gap-3 md:grid-cols-3">
                <div className="rounded-xl border border-border bg-background p-4">
                  <p className="text-xs font-semibold text-muted">Facebook</p>
                  <textarea
                    className="mt-2 min-h-[120px] w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
                    value={variants.facebook}
                    onChange={(e) => setVariants({ ...variants, facebook: e.target.value })}
                  />
                </div>
                <div className="rounded-xl border border-border bg-background p-4">
                  <p className="text-xs font-semibold text-muted">Instagram</p>
                  <textarea
                    className="mt-2 min-h-[120px] w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
                    value={variants.instagram}
                    onChange={(e) => setVariants({ ...variants, instagram: e.target.value })}
                  />
                </div>
                <div className="rounded-xl border border-border bg-background p-4">
                  <p className="text-xs font-semibold text-muted">X</p>
                  <textarea
                    className="mt-2 min-h-[120px] w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
                    value={variants.x}
                    onChange={(e) => setVariants({ ...variants, x: e.target.value })}
                  />
                </div>
              </div>
            ) : null}
            <div className="grid gap-2 sm:grid-cols-2">
              <button className="glass-button" type="button" onClick={() => navigator.clipboard.writeText(genResult.generated_text)}>
                Copiar
              </button>
              <button className="glass-button" type="button" onClick={saveDraft}>
                Guardar como pendiente de revisión
              </button>
            </div>
          </div>
        ) : null}
      </div>

      <div className="glass-card p-6">
        <div className="flex items-center justify-between gap-4">
          <h3 className="text-base font-semibold">Cola de revisión</h3>
          <button className="glass-button" type="button" onClick={refresh}>
            Actualizar
          </button>
        </div>

        {loadState === "loading" ? <p className="mt-3 text-sm text-muted">Cargando…</p> : null}
        {loadState === "error" ? (
          <p className="mt-3 text-sm text-amber-300">No se pudo cargar la cola (verifica tabla/políticas).</p>
        ) : null}

        <div className="mt-4 grid gap-3 md:grid-cols-2">
          {drafts.map((d) => (
            <button
              key={d.id}
              className="glass-card relative p-4 text-left transition hover:bg-white/10"
              onClick={() => setSelected(d)}
              type="button"
            >
              <label
                className="absolute right-3 top-3 flex items-center gap-2 text-xs text-muted"
                onClick={(e) => e.stopPropagation()}
              >
                <input type="checkbox" checked={Boolean(checked[d.id])} onChange={() => toggleChecked(d.id)} />
                <span>Seleccionar</span>
              </label>
              <p className="text-sm font-semibold">{d.content_type}</p>
              <p className="mt-1 text-xs text-muted">
                {polById[d.candidate_id]?.name ?? d.candidate_id}
                {polById[d.candidate_id]?.region ? ` · ${polById[d.candidate_id]!.region}` : ""}
              </p>
              <p className="mt-2 line-clamp-2 text-sm text-muted">{d.topic}</p>
              <p className="mt-2 text-xs text-muted">
                Estado: <span className="text-foreground">{d.status}</span> ·{" "}
                {d.created_at ? new Date(d.created_at).toLocaleString("es-CO") : ""}
                {" · "}
                <span className={isImageReady(d) ? "text-emerald-300" : "text-amber-300"}>
                  {isImageReady(d) ? "Imagen lista" : "Sin imagen"}
                </span>
              </p>
            </button>
          ))}
        </div>

        {bulkHasSelection ? (
          <div className="mt-4 rounded-2xl border border-border bg-background/60 p-4">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-sm font-semibold">Seleccionados: {selectedIds.length}</p>
              <div className="flex flex-wrap gap-2">
                <label className="flex items-center gap-2 text-xs text-muted">
                  <input type="checkbox" checked={bulkAllowNoImage} onChange={(e) => setBulkAllowNoImage(e.target.checked)} />
                  Permitir sin imagen (solo esta acción)
                </label>
                <button className="glass-button" type="button" onClick={bulkPublishCitizen}>
                  Publicar Centro Informativo
                </button>
                <button className="glass-button" type="button" onClick={bulkSendToApprovedNetworks}>
                  Enviar a redes (auto)
                </button>
                <button className="glass-button" type="button" onClick={bulkDelete}>
                  Eliminar
                </button>
                <button className="glass-button" type="button" onClick={clearSelection}>
                  Limpiar
                </button>
              </div>
            </div>
            <p className="mt-2 text-xs text-muted">
              Reglas: no publica si falta título, autor/medio o imagen (a menos que autorices “sin imagen”).
            </p>
          </div>
        ) : null}

        {loadState === "ready" && drafts.length === 0 ? (
          <div className="mt-4 glass-card p-6">
            <p className="text-sm text-muted">Aún no se han generado borradores. Cuando n8n ejecute, aparecerán aquí automáticamente.</p>
          </div>
        ) : null}

        {selected ? (
          <div className="mt-6 rounded-2xl border border-border bg-background/60 p-5">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="text-sm font-semibold">Detalle</p>
                <p className="text-xs text-muted">{selected.id}</p>
              </div>
              <div className="flex flex-wrap gap-2">
                <button className="glass-button" type="button" onClick={() => setSelected(null)}>
                  Cerrar
                </button>
                <button className="glass-button" type="button" onClick={() => deleteDraft(selected)}>
                  Eliminar borrador
                </button>
                <button className="glass-button" type="button" onClick={generateImageForSelected} disabled={imageState === "loading"}>
                  {imageState === "loading" ? "Generando imagen…" : "Generar imagen con AIs"}
                </button>
                <button
                  className="glass-button"
                  type="button"
                  onClick={() => updateDraft({ id: selected.id, status: "approved" })}
                >
                  Aprobar
                </button>
                <button
                  className="glass-button"
                  type="button"
                  onClick={() => updateDraft({ id: selected.id, status: "rejected" })}
                >
                  Rechazar
                </button>
                <button
                  className="glass-button"
                  type="button"
                  onClick={() => publishToCitizenCenter(selected)}
                  disabled={selected.content_type !== "blog" || (selected.status !== "approved" && selected.status !== "edited")}
                >
                  Publicar en Centro informativo
                </button>
                <button className="glass-button" type="button" onClick={() => sendToN8n(selected)} disabled={selected.status !== "approved"}>
                  Enviar a n8n (WAIT)
                </button>
                <button
                  className="glass-button"
                  type="button"
                  onClick={() => sendDraftToApprovedNetworks(selected)}
                  disabled={selected.status !== "approved" && selected.status !== "edited"}
                >
                  Enviar a redes (auto)
                </button>
              </div>
            </div>

            <div className="mt-4 grid gap-3">
              <div className="rounded-xl border border-border bg-background p-4">
                <p className="text-sm font-semibold">Imagen</p>
                <p className="mt-1 text-xs text-muted">
                  Estado:{" "}
                  <span className={isImageReady(selected) ? "text-emerald-300" : "text-amber-300"}>
                    {isImageReady(selected) ? "lista" : "pendiente"}
                  </span>
                </p>
                {imageUrlOf(selected) ? (
                  <p className="mt-2 text-xs text-muted">
                    <a className="underline" href={imageUrlOf(selected)!} target="_blank" rel="noreferrer">
                      Abrir imagen
                    </a>
                  </p>
                ) : null}
                {imageState === "error" ? <p className="mt-2 text-xs text-amber-300">{imageErrorMsg}</p> : null}
                <p className="mt-2 text-xs text-muted">No bloquea aprobación/publicación si no hay imagen.</p>
                <label className="mt-3 flex items-center gap-2 text-xs text-muted">
                  <input
                    type="checkbox"
                    checked={allowNoImage(selected)}
                    onChange={async (e) => {
                      const next = e.target.checked;
                      const meta = (selected.metadata ?? {}) as Record<string, unknown>;
                      await updateDraft({ id: selected.id, metadata: { ...meta, allow_no_image: next }, status: "edited" });
                      await refresh();
                    }}
                  />
                  Autorizar publicación sin imagen (este borrador)
                </label>
              </div>
              {(() => {
                const ref = getPublishedRef(selected);
                if (!ref.slug && !ref.post_id) return null;
                return (
                  <div className="rounded-xl border border-border bg-background p-4">
                    <p className="text-sm font-semibold">Publicación (Centro Informativo)</p>
                    <p className="mt-1 text-xs text-muted">
                      {ref.slug ? (
                        <a className="underline" href={`/centro-informativo#${ref.slug}`} target="_blank" rel="noreferrer">
                          Abrir publicación pública
                        </a>
                      ) : (
                        <span>ID: {ref.post_id}</span>
                      )}
                    </p>
                    <div className="mt-3 flex flex-wrap gap-2">
                      <button className="glass-button" type="button" onClick={() => managePublishedPost(selected, "archive")}>
                        Despublicar
                      </button>
                      <button className="glass-button" type="button" onClick={() => managePublishedPost(selected, "delete")}>
                        Eliminar publicación
                      </button>
                    </div>
                    <p className="mt-2 text-xs text-muted">
                      “Despublicar” la oculta al público. “Eliminar publicación” la borra definitivamente.
                    </p>
                  </div>
                );
              })()}

              <div className="rounded-xl border border-border bg-background p-4">
                <p className="text-sm font-semibold">Envío a redes (automático)</p>
                <p className="mt-2 text-xs text-muted">
                  El sistema rutea automáticamente usando redes aprobadas en Admin → n8n / Redes. No necesitas seleccionar plataformas aquí.
                </p>
              </div>
              <label className="text-sm font-medium">Texto (editable)</label>
              <textarea
                className="min-h-[180px] w-full rounded-xl border border-border bg-background px-3 py-2 text-sm"
                value={selected.generated_text}
                onChange={(e) => setSelected({ ...selected, generated_text: e.target.value, status: "edited" })}
              />

              {selected.variants ? (
                <div className="grid gap-3 md:grid-cols-3">
                  <div className="rounded-xl border border-border bg-background p-4">
                    <p className="text-xs font-semibold text-muted">Facebook</p>
                    <textarea
                      className="mt-2 min-h-[120px] w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
                      value={selected.variants.facebook}
                      onChange={(e) =>
                        setSelected({
                          ...selected,
                          status: "edited",
                          variants: { ...selected.variants!, facebook: e.target.value },
                        })
                      }
                    />
                  </div>
                  <div className="rounded-xl border border-border bg-background p-4">
                    <p className="text-xs font-semibold text-muted">Instagram</p>
                    <textarea
                      className="mt-2 min-h-[120px] w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
                      value={selected.variants.instagram}
                      onChange={(e) =>
                        setSelected({
                          ...selected,
                          status: "edited",
                          variants: { ...selected.variants!, instagram: e.target.value },
                        })
                      }
                    />
                  </div>
                  <div className="rounded-xl border border-border bg-background p-4">
                    <p className="text-xs font-semibold text-muted">X</p>
                    <textarea
                      className="mt-2 min-h-[120px] w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
                      value={selected.variants.x}
                      onChange={(e) =>
                        setSelected({
                          ...selected,
                          status: "edited",
                          variants: { ...selected.variants!, x: e.target.value },
                        })
                      }
                    />
                  </div>
                </div>
              ) : null}

              <button className="glass-button" type="button" onClick={() => updateDraft({ id: selected.id, generated_text: selected.generated_text, status: "edited" })}>
                Guardar cambios
              </button>
              {selected.variants ? (
                <button
                  className="glass-button"
                  type="button"
                  onClick={() => updateDraft({ id: selected.id, variants: selected.variants, status: "edited" })}
                >
                  Guardar variantes
                </button>
              ) : null}
              <p className="text-xs text-muted">
                “Enviar a n8n” solo se habilita cuando el borrador está en estado <span className="text-foreground">approved</span>.
              </p>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}

