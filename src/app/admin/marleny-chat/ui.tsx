"use client";

import { useEffect, useMemo, useState } from "react";

type Msg = { role: "user" | "assistant"; content: string };

const DEFAULT_CANDIDATE = "jose-angel-martinez";

type PoliticianOption = {
  id: string;
  slug: string;
  name: string;
  office: string;
  region: string;
  party: string | null;
};

export function MarlenyChatClient() {
  const [candidateId, setCandidateId] = useState(DEFAULT_CANDIDATE);
  const [options, setOptions] = useState<PoliticianOption[]>([]);
  const [optionsState, setOptionsState] = useState<"idle" | "loading" | "ready" | "error">("idle");
  const [messages, setMessages] = useState<Msg[]>([
    {
      role: "assistant",
      content:
        "Hola. Dime qué candidato estás trabajando (Candidate ID) y qué necesitas: blog, redes, propuesta, o revisión editorial.",
    },
  ]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);

  const canSend = useMemo(() => input.trim().length > 0 && candidateId.trim().length > 0 && !loading, [input, candidateId, loading]);

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
        // Auto-poblar el primer candidato (si aplica)
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

  async function send() {
    if (!canSend) return;
    const content = input.trim();
    setInput("");

    const nextMessages: Msg[] = [...messages, { role: "user", content }];
    setMessages(nextMessages);
    setLoading(true);

    const resp = await fetch("/api/admin/marleny-chat", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ candidate_id: candidateId.trim(), messages: nextMessages }),
    });

    setLoading(false);
    if (!resp.ok) {
      const j = (await resp.json().catch(() => null)) as any;
      const reason =
        typeof j?.error === "string"
          ? j.error === "unauthorized"
            ? "Sesión no detectada. Inicia sesión de nuevo."
            : j.error
          : null;
      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content: reason
            ? `No fue posible responder.\nMotivo: ${reason}`
            : "No fue posible responder (verifica sesión y configuración).",
        },
      ]);
      return;
    }

    const data = (await resp.json()) as { ok?: boolean; reply?: string };
    setMessages((prev) => [...prev, { role: "assistant", content: typeof data.reply === "string" ? data.reply : "Respuesta inválida." }]);
  }

  return (
    <div className="grid gap-4 lg:grid-cols-3">
      <div className="glass-card p-6 lg:col-span-1">
        <h3 className="text-base font-semibold">Configuración</h3>
        <div className="mt-4 grid gap-2">
          <label className="text-sm font-medium">Candidate ID</label>
          {options.length ? (
            <select
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
              className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm"
              value={candidateId}
              onChange={(e) => setCandidateId(e.target.value)}
              placeholder="Escribe el Candidate ID (ej.: jose-angel-martinez)…"
            />
          )}
          <p className="text-xs text-muted">
            {optionsState === "loading"
              ? "Cargando candidatos…"
              : optionsState === "error"
                ? "No se pudo cargar la lista. Puedes escribir el ID manualmente."
                : options.length
                  ? "Lista cargada (incluye geolocalización)."
                  : "Escribe el ID manualmente."}
          </p>
        </div>
      </div>

      <div className="glass-card flex min-h-[520px] flex-col p-6 lg:col-span-2">
        <div className="flex items-center justify-between gap-3">
          <h3 className="text-base font-semibold">Chat</h3>
          {loading ? (
            <div className="inline-flex items-center gap-2 text-xs text-muted">
              <svg
                aria-hidden
                viewBox="0 0 24 24"
                className="h-4 w-4 animate-pulse text-sky-200"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.6"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                {/* simple “brain” mark */}
                <path d="M9 4.5c-2.1 0-3.8 1.7-3.8 3.8v.3c-1.1.5-1.9 1.6-1.9 2.9 0 1.2.7 2.3 1.8 2.8v.6c0 2 1.6 3.6 3.6 3.6h.3c.4 1.2 1.5 2 2.8 2" />
                <path d="M15 4.5c2.1 0 3.8 1.7 3.8 3.8v.3c1.1.5 1.9 1.6 1.9 2.9 0 1.2-.7 2.3-1.8 2.8v.6c0 2-1.6 3.6-3.6 3.6h-.3c-.4 1.2-1.5 2-2.8 2" />
                <path d="M12 6v12" />
                <path d="M9.2 9.2c.6-.5 1.4-.8 2.3-.8" />
                <path d="M14.8 9.2c-.6-.5-1.4-.8-2.3-.8" />
              </svg>
              <span>Escribiendo…</span>
            </div>
          ) : (
            <p className="text-xs text-muted">Listo</p>
          )}
        </div>

        <div className="mt-4 flex-1 space-y-3 overflow-auto rounded-2xl border border-border bg-background/40 p-4">
          {messages.map((m, idx) => (
            <div
              key={idx}
              className={`max-w-[92%] rounded-2xl border border-white/15 px-4 py-3 text-sm ${
                m.role === "user" ? "ml-auto bg-white/10" : "mr-auto bg-white/5"
              }`}
            >
              <p className="whitespace-pre-wrap">{m.content}</p>
            </div>
          ))}
        </div>

        <div className="mt-4 flex gap-2">
          <input
            className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Escribe tu instrucción…"
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                void send();
              }
            }}
          />
          <button className="glass-button" type="button" onClick={send} disabled={!canSend}>
            Enviar
          </button>
        </div>

        <p className="mt-2 text-xs text-muted">
          Nota: este chat no publica. Para publicar, usa la cola de revisión y el botón “Publicar en Centro informativo”.
        </p>
      </div>
    </div>
  );
}

