"use client";

import { useEffect, useMemo, useState } from "react";

type State =
  | { kind: "loading" }
  | { kind: "error"; message: string }
  | {
      kind: "ready";
      candidate: { name: string; office: string; region: string; ballot_number: number | null };
      destination: { network_name: string; network_type: string; profile_or_page_url: string };
      expires_at: string;
    }
  | { kind: "done"; status: "approved" | "revoked" };

export function AuthorizeClient({ token }: { token: string }) {
  const [state, setState] = useState<State>({ kind: "loading" });
  const [submitting, setSubmitting] = useState(false);

  const trimmed = useMemo(() => (token || "").trim(), [token]);

  useEffect(() => {
    let cancelled = false;
    if (!trimmed) {
      setState({ kind: "error", message: "Enlace inválido (token faltante)." });
      return;
    }
    setState({ kind: "loading" });
    fetch(`/api/public/network-authorization?token=${encodeURIComponent(trimmed)}`, { method: "GET" })
      .then(async (r) => {
        const j = (await r.json().catch(() => null)) as any;
        if (cancelled) return;
        if (!r.ok || !j?.ok) {
          const err = typeof j?.error === "string" ? j.error : "invalid";
          const map: Record<string, string> = {
            token_required: "Token faltante.",
            not_found: "Este enlace no existe.",
            already_used: "Este enlace ya fue usado.",
            expired: "Este enlace ya expiró. Solicita uno nuevo.",
          };
          setState({ kind: "error", message: map[err] ?? "No fue posible validar el enlace." });
          return;
        }
        setState({
          kind: "ready",
          candidate: j.candidate,
          destination: j.destination,
          expires_at: j.invite?.expires_at ?? "",
        });
      })
      .catch(() => {
        if (!cancelled) setState({ kind: "error", message: "Error de red. Intenta de nuevo." });
      });
    return () => {
      cancelled = true;
    };
  }, [trimmed]);

  async function decide(decision: "approve" | "reject") {
    if (!trimmed) return;
    setSubmitting(true);
    const r = await fetch("/api/public/network-authorization", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ token: trimmed, decision }),
    });
    const j = (await r.json().catch(() => null)) as any;
    setSubmitting(false);
    if (!r.ok || !j?.ok) {
      const err = typeof j?.error === "string" ? j.error : "upstream_error";
      const map: Record<string, string> = {
        already_used: "Este enlace ya fue usado.",
        expired: "Este enlace ya expiró. Solicita uno nuevo.",
        not_found: "Este enlace no existe.",
      };
      setState({ kind: "error", message: map[err] ?? "No fue posible procesar tu decisión." });
      return;
    }
    setState({ kind: "done", status: j.status === "approved" ? "approved" : "revoked" });
  }

  if (state.kind === "loading") {
    return <div className="glass-card p-6 text-sm text-muted">Cargando…</div>;
  }
  if (state.kind === "error") {
    return (
      <div className="glass-card p-6">
        <p className="text-sm font-semibold">No se pudo abrir el enlace</p>
        <p className="mt-2 text-sm text-muted">{state.message}</p>
      </div>
    );
  }
  if (state.kind === "done") {
    return (
      <div className="glass-card p-6">
        <p className="text-sm font-semibold">
          {state.status === "approved" ? "Autorización aprobada" : "Autorización rechazada"}
        </p>
        <p className="mt-2 text-sm text-muted">
          Ya puedes cerrar esta página. El admin verá el estado actualizado.
        </p>
      </div>
    );
  }

  const exp = state.expires_at ? new Date(state.expires_at).toLocaleString("es-CO") : "—";

  return (
    <div className="space-y-4">
      <div className="glass-card p-6">
        <p className="text-sm font-semibold">Resumen</p>
        <p className="mt-2 text-sm text-muted">
          Candidato: <span className="text-foreground">{state.candidate.name}</span>
          {state.candidate.ballot_number ? ` · Tarjetón ${state.candidate.ballot_number}` : ""}
          {state.candidate.office ? ` · ${state.candidate.office}` : ""}
          {state.candidate.region ? ` · ${state.candidate.region}` : ""}
        </p>
        <p className="mt-2 text-sm text-muted">
          Red: <span className="text-foreground">{state.destination.network_name}</span> ·{" "}
          <span className="text-muted">{state.destination.network_type}</span>
        </p>
        <p className="mt-2 text-sm text-muted">
          Perfil/Página:{" "}
          <a className="underline" href={state.destination.profile_or_page_url} target="_blank" rel="noreferrer">
            abrir
          </a>
        </p>
        <p className="mt-2 text-xs text-muted">Este enlace expira: {exp}</p>
      </div>

      <div className="glass-card p-6">
        <p className="text-sm text-muted">
          Al aprobar, autorizas que el sistema publique contenido en esta red cuando el contenido sea aprobado editorialmente.
          Puedes revocar más adelante solicitándolo al admin.
        </p>
        <div className="mt-4 flex flex-col gap-2 sm:flex-row">
          <button className="glass-button" disabled={submitting} onClick={() => decide("approve")} type="button">
            {submitting ? "Procesando…" : "Aprobar"}
          </button>
          <button className="glass-button" disabled={submitting} onClick={() => decide("reject")} type="button">
            {submitting ? "Procesando…" : "Rechazar"}
          </button>
        </div>
      </div>
    </div>
  );
}

