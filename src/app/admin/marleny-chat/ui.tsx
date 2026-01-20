"use client";

import { useMemo, useState } from "react";

type Msg = { role: "user" | "assistant"; content: string };

const DEFAULT_CANDIDATE = "jose-angel-martinez";

export function MarlenyChatClient() {
  const [candidateId, setCandidateId] = useState(DEFAULT_CANDIDATE);
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
      setMessages((prev) => [...prev, { role: "assistant", content: "No fue posible responder (verifica Marleny SI y permisos)." }]);
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
          <input
            className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm"
            value={candidateId}
            onChange={(e) => setCandidateId(e.target.value)}
            placeholder="jose-angel-martinez"
          />
          <p className="text-xs text-muted">Esto guía el contexto del chat. No se guarda historial.</p>
        </div>
      </div>

      <div className="glass-card flex min-h-[520px] flex-col p-6 lg:col-span-2">
        <div className="flex items-center justify-between gap-3">
          <h3 className="text-base font-semibold">Chat</h3>
          <p className="text-xs text-muted">{loading ? "Escribiendo…" : "Listo"}</p>
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

