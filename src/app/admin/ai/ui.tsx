"use client";

import { useEffect, useMemo, useState } from "react";
import type { ContentType, GenerateResponse } from "@/lib/automation/types";

type GenState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "done"; data: GenerateResponse }
  | { status: "error"; message: string };

type PoliticianOption = {
  id: string;
  slug: string;
  name: string;
  office: string;
  region: string;
  party: string | null;
};

export function AdminAiPanel() {
  const [contentType, setContentType] = useState<ContentType>("proposal");
  const [topic, setTopic] = useState("");
  const [tone, setTone] = useState("");
  const [candidateId, setCandidateId] = useState("jose-angel-martinez");
  const [options, setOptions] = useState<PoliticianOption[]>([]);
  const [optionsState, setOptionsState] = useState<"idle" | "loading" | "ready" | "error">("idle");
  const [state, setState] = useState<GenState>({ status: "idle" });
  const [saveState, setSaveState] = useState<"idle" | "loading" | "done" | "error">("idle");
  const [variants, setVariants] = useState<{ facebook: string; instagram: string; x: string } | null>(null);
  const [imageKeywords, setImageKeywords] = useState<string>("");

  const canGenerate = useMemo(() => topic.trim().length > 0 && candidateId.trim().length > 0, [topic, candidateId]);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setOptionsState("loading");
      const res = await fetch("/api/admin/politicians/list", { method: "GET" }).catch(() => null);
      if (!res || !res.ok) {
        if (!cancelled) setOptionsState("error");
        return;
      }
      const json = (await res.json().catch(() => null)) as any;
      const rows = Array.isArray(json?.politicians) ? (json.politicians as any[]) : [];
      const next = rows
        .filter((r) => r && typeof r === "object" && typeof r.id === "string")
        .map((r) => ({
          id: String(r.id),
          slug: typeof r.slug === "string" ? r.slug : "",
          name: typeof r.name === "string" ? r.name : "",
          office: typeof r.office === "string" ? r.office : "",
          region: typeof r.region === "string" ? r.region : "",
          party: typeof r.party === "string" ? r.party : null,
        })) as PoliticianOption[];

      if (!cancelled) {
        setOptions(next);
        setOptionsState("ready");
        setCandidateId((prev) => {
          const p = prev.trim();
          if (p && next.some((o) => o.id === p || o.slug === p)) return prev;
          return next[0]?.id ?? prev;
        });
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  async function generate() {
    if (!canGenerate) return;
    setState({ status: "loading" });

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
      const err = typeof j?.error === "string" ? j.error : "";
      const meta = j?.meta;
      const engines =
        meta && typeof meta === "object" && meta.engines && typeof meta.engines === "object"
          ? meta.engines
          : null;
      const hint =
        engines && (typeof engines.Actuation === "string" || typeof engines.Volume === "string")
          ? `\nDiagnóstico (safe): Actuation=${String((engines as any).Actuation)} · Volume=${String((engines as any).Volume)}`
          : "";
      const msg = err
        ? `No fue posible generar el contenido. Motivo: ${err}${hint}`
        : `No fue posible generar el contenido (verifica permisos/configuración).${hint}`;
      setState({ status: "error", message: msg });
      return;
    }

    const data = (await res.json()) as GenerateResponse;
    setState({ status: "done", data });
    setVariants(data.variants ?? null);
    if (Array.isArray(data.image_keywords) && data.image_keywords.length) {
      setImageKeywords(data.image_keywords.join(", "));
    } else {
      setImageKeywords("");
    }
  }

  async function sendToReviewQueue() {
    if (state.status !== "done") return;
    setSaveState("loading");

    const keywords = imageKeywords
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);

    const res = await fetch("/api/admin/drafts", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        candidate_id: state.data.candidate_id,
        content_type: state.data.content_type,
        topic,
        tone: tone.trim() ? tone.trim() : null,
        generated_text: state.data.generated_text,
        variants: variants ?? null,
        image_keywords: keywords.length ? keywords : null,
        status: "pending_review",
        metadata: { token_estimate: state.data.token_estimate },
        source: "web",
      }),
    });

    if (!res.ok) {
      setSaveState("error");
      return;
    }

    setSaveState("done");
  }

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <div className="glass-card p-6">
        <h3 className="text-base font-semibold">Solicitud</h3>
        <div className="mt-4 grid gap-4">
          <div className="grid gap-1">
            <label className="text-sm font-medium" htmlFor="candidate">
              Candidate ID
            </label>
            {options.length ? (
              <select
                id="candidate"
                className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm"
                value={candidateId}
                onChange={(e) => setCandidateId(e.target.value)}
              >
                {options.map((p) => {
                  const extra = p.slug && p.slug !== p.id ? ` · slug: ${p.slug}` : "";
                  return (
                    <option key={p.id} value={p.id}>
                      {p.name} · {p.office} · {p.region}
                      {extra}
                    </option>
                  );
                })}
              </select>
            ) : (
              <input
                id="candidate"
                className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm"
                value={candidateId}
                onChange={(e) => setCandidateId(e.target.value)}
                placeholder="Ej.: jose-angel-martinez"
              />
            )}
            <p className="text-xs text-muted">
              {optionsState === "loading"
                ? "Cargando candidatos…"
                : optionsState === "error"
                  ? "No se pudo cargar la lista. Puedes escribir el ID manualmente."
                  : options.length
                    ? "Lista cargada (incluye geolocalización)."
                    : "Ej.: jose-angel-martinez, eduardo-buitrago"}
            </p>
          </div>

          <div className="grid gap-1">
            <label className="text-sm font-medium" htmlFor="type">
              Tipo de contenido
            </label>
            <select
              id="type"
              className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm"
              value={contentType}
              onChange={(e) => setContentType(e.target.value as ContentType)}
            >
              <option value="proposal">proposal</option>
              <option value="blog">blog</option>
              <option value="social">social</option>
            </select>
          </div>

          <div className="grid gap-1">
            <label className="text-sm font-medium" htmlFor="topic">
              Tema / instrucción
            </label>
            <textarea
              id="topic"
              className="min-h-[120px] w-full rounded-xl border border-border bg-background px-3 py-2 text-sm"
              value={topic}
              onChange={(e) => setTopic(e.target.value)}
              maxLength={160}
              placeholder="Escribe el tema con claridad. Evita slogans; busca precisión y verificabilidad."
            />
          </div>

          <div className="grid gap-1">
            <label className="text-sm font-medium" htmlFor="tone">
              Tono (opcional)
            </label>
            <input
              id="tone"
              className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm"
              value={tone}
              onChange={(e) => setTone(e.target.value)}
              maxLength={80}
              placeholder="Ej.: institucional, sobrio, humano"
            />
          </div>

          <button className="glass-button w-full" onClick={generate} disabled={!canGenerate || state.status === "loading"}>
            {state.status === "loading" ? "Generando…" : "Generar"}
          </button>

          <p className="text-xs text-muted">
            Este panel no publica ni guarda automáticamente. La generación ocurre solo al presionar “Generar”.
          </p>
        </div>
      </div>

      <div className="glass-card p-6">
        <h3 className="text-base font-semibold">Resultado</h3>
        <div className="mt-4">
          {state.status === "idle" ? <p className="text-sm text-muted">Sin resultado aún.</p> : null}
          {state.status === "error" ? <p className="text-sm text-amber-300">{state.message}</p> : null}
          {state.status === "done" ? (
            <div className="space-y-3">
              <div className="rounded-xl border border-border bg-background p-4">
                <pre className="whitespace-pre-wrap text-sm text-foreground">{state.data.generated_text}</pre>
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
              <div className="grid gap-1">
                <label className="text-sm font-medium">Keywords de imagen (comma-separado)</label>
                <input
                  className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm"
                  value={imageKeywords}
                  onChange={(e) => setImageKeywords(e.target.value)}
                  placeholder="ej.: Meta, campo, congreso, seguridad"
                />
                <p className="text-xs text-muted">Sugerencias únicamente; no scraping.</p>
              </div>
              <p className="text-xs text-muted">
                token_estimate: <span className="text-foreground">{state.data.token_estimate}</span> · created_at:{" "}
                <span className="text-foreground">{state.data.created_at}</span>
              </p>
              <div className="grid gap-2 sm:grid-cols-2">
                <button
                  className="glass-button"
                  onClick={() => navigator.clipboard.writeText(state.data.generated_text)}
                  type="button"
                >
                  Copiar texto
                </button>
                <button className="glass-button" onClick={sendToReviewQueue} type="button" disabled={saveState === "loading"}>
                  {saveState === "loading"
                    ? "Guardando…"
                    : saveState === "done"
                      ? "Guardado en revisión"
                      : "Guardar en cola de revisión"}
                </button>
              </div>
              {saveState === "error" ? (
                <p className="text-xs text-amber-300">
                  No fue posible guardar en la cola de revisión (verifica acceso y la tabla ai_drafts en Supabase).
                </p>
              ) : null}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}

