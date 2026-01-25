"use client";

import { useEffect, useMemo, useState } from "react";

type LoadState = "loading" | "ready" | "saving" | "error";

export function AdminAutoPublishToggle() {
  const [state, setState] = useState<LoadState>("loading");
  const [enabled, setEnabled] = useState<boolean>(true);
  const [everyHours, setEveryHours] = useState<number>(4);

  const label = useMemo(() => (enabled ? "ON" : "OFF"), [enabled]);

  useEffect(() => {
    let cancelled = false;
    setState("loading");
    fetch("/api/admin/settings/auto-blog", { method: "GET" })
      .then(async (r) => {
        const j = (await r.json().catch(() => null)) as any;
        if (cancelled) return;
        if (r.ok && j?.ok) {
          setEnabled(Boolean(j.enabled));
          const h = typeof j.every_hours === "number" ? j.every_hours : 4;
          setEveryHours(Number.isFinite(h) ? h : 4);
          setState("ready");
          return;
        }
        setState("error");
      })
      .catch(() => {
        if (!cancelled) setState("error");
      });
    return () => {
      cancelled = true;
    };
  }, []);

  async function setNext(next: boolean) {
    setState("saving");
    setEnabled(next);
    try {
      const r = await fetch("/api/admin/settings/auto-blog", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ enabled: next }),
      });
      if (!r.ok) setState("error");
      else setState("ready");
    } catch {
      setState("error");
    }
  }

  return (
    <div className="flex items-center gap-3 rounded-full border border-border bg-surface/60 px-3 py-2 shadow-[0_0_0_1px_rgba(255,255,255,0.06)_inset] backdrop-blur-xl">
      <div className="leading-tight">
        <p className="text-[11px] font-semibold tracking-wide text-foreground/90">Auto‑publicación</p>
        <p className="text-[11px] text-muted">
          {enabled ? "ON: crea + publica (web + redes aprobadas)" : "OFF: no publica automático"} · cada ~{everyHours}h
        </p>
      </div>

      <button
        type="button"
        role="switch"
        aria-checked={enabled}
        className={[
          "relative inline-flex h-6 w-[84px] shrink-0 items-center rounded-full border transition",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-300/70 focus-visible:ring-offset-2 focus-visible:ring-offset-background",
          enabled ? "border-emerald-200/50 bg-emerald-400/30" : "border-white/15 bg-white/10",
        ].join(" ")}
        onClick={() => void setNext(!enabled)}
        disabled={state === "saving"}
        title="Control global de auto-blog + auto-publicación"
      >
        <span className="sr-only">{label}</span>

        <span className="absolute inset-0 flex items-center justify-between px-2 text-[10px] font-semibold tracking-wide">
          <span className={enabled ? "text-emerald-200/90" : "text-muted"}>ON</span>
          <span className={!enabled ? "text-slate-200/80" : "text-muted"}>OFF</span>
        </span>

        <span
          aria-hidden
          className={[
            "absolute left-1 inline-flex h-4 w-4 items-center justify-center rounded-full transition",
            enabled
              ? "translate-x-[56px] bg-emerald-300 shadow-[0_0_22px_rgba(52,211,153,0.85)] marketbrain-neon-pulse"
              : "translate-x-0 bg-slate-400/60 shadow-[0_0_0_rgba(0,0,0,0)]",
          ].join(" ")}
        />
      </button>
    </div>
  );
}

