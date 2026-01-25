"use client";

import { useEffect, useMemo, useState } from "react";

const DEFAULT_MESSAGES = [
  "Información clara · propuestas verificables · confianza institucional.",
  "Seguridad y legalidad · transparencia · respeto por el ciudadano.",
  "Actualidad sin show · análisis cívico · decisiones con criterio.",
  "Colombia 2026 · educación cívica · integridad y cumplimiento.",
  "Tu voto cuenta cuando entiendes el contexto · lectura en 60 segundos.",
] as const;

export function RotatingSeoMicrocopy(props: { className?: string; messages?: string[]; intervalMs?: number }) {
  const messages = useMemo(() => {
    const m = Array.isArray(props.messages) ? props.messages.map((x) => String(x || "").trim()).filter(Boolean) : [];
    return (m.length ? m : Array.from(DEFAULT_MESSAGES)) as string[];
  }, [props.messages]);

  const intervalMs = typeof props.intervalMs === "number" && Number.isFinite(props.intervalMs) ? Math.max(2400, props.intervalMs) : 4200;

  const [idx, setIdx] = useState(0);
  const [phase, setPhase] = useState<"in" | "out">("in");

  useEffect(() => {
    if (messages.length <= 1) return;
    const t = setInterval(() => {
      setPhase("out");
      setTimeout(() => {
        setIdx((v) => (v + 1) % messages.length);
        setPhase("in");
      }, 220);
    }, intervalMs);
    return () => clearInterval(t);
  }, [intervalMs, messages.length]);

  const text = messages[idx] ?? "";

  return (
    <p
      className={[
        "text-xs sm:text-sm",
        "text-foreground/70",
        "tracking-wide",
        "transition-opacity duration-300",
        phase === "out" ? "opacity-0" : "opacity-100",
        props.className ?? "",
      ].join(" ")}
      aria-live="polite"
    >
      {text}
    </p>
  );
}

