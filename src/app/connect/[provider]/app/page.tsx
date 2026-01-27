"use client";

import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";

type Provider = "meta" | "x" | "reddit";

function isProvider(p: string): p is Provider {
  return p === "meta" || p === "x" || p === "reddit";
}

function buildAppDeepLink(provider: Provider, authUrl: string): { appUrl: string; fallbackUrl: string } {
  // Always keep a safe web fallback.
  const fallbackUrl = authUrl;

  if (provider === "meta") {
    // Facebook app deep link wrapper (best-effort). If FB isn't installed, browser ignores and we fall back.
    // Works on many Android/iOS setups.
    const appUrl = `fb://facewebmodal/f?href=${encodeURIComponent(authUrl)}`;
    return { appUrl, fallbackUrl };
  }

  if (provider === "x") {
    // On mobile, twitter.com links often open the X app via universal links.
    return { appUrl: authUrl, fallbackUrl };
  }

  // reddit: universal links usually open the app if installed.
  return { appUrl: authUrl, fallbackUrl };
}

export default function ConnectProviderAppPage({ params }: { params: { provider: string } }) {
  const sp = useSearchParams();
  const providerRaw = String(params?.provider ?? "").trim();
  const candidateId = useMemo(() => String(sp.get("candidate_id") ?? "").trim(), [sp]);

  const [state, setState] = useState<"idle" | "loading" | "done" | "error">("idle");
  const [err, setErr] = useState<string>("");

  useEffect(() => {
    if (!isProvider(providerRaw as any)) {
      setState("error");
      setErr("Proveedor inválido.");
      return;
    }
    if (!candidateId) {
      setState("error");
      setErr("Falta candidate_id. Solicita un nuevo enlace al administrador.");
      return;
    }

    let cancelled = false;
    setState("loading");
    setErr("");

    void (async () => {
      const url = `/api/public/oauth/${encodeURIComponent(providerRaw)}/link?candidate_id=${encodeURIComponent(candidateId)}`;
      const res = await fetch(url, { method: "GET", cache: "no-store" }).catch(() => null);
      const j = (await res?.json().catch(() => null)) as any;
      if (cancelled) return;
      if (!res || !res.ok || !j?.ok || typeof j?.auth_url !== "string") {
        setState("error");
        setErr("Conexión no disponible. Contacta al administrador para revisar configuración OAuth.");
        return;
      }

      const authUrl = String(j.auth_url).trim();
      if (!authUrl) {
        setState("error");
        setErr("Conexión no disponible (auth_url vacío).");
        return;
      }

      const { appUrl, fallbackUrl } = buildAppDeepLink(providerRaw as Provider, authUrl);

      // Attempt app first; fallback to web.
      // Note: browsers don't reliably tell us if the app opened, so we use a short timer.
      const started = Date.now();
      window.location.href = appUrl;
      window.setTimeout(() => {
        if (Date.now() - started < 2500) window.location.href = fallbackUrl;
      }, 1200);

      setState("done");
    })();

    return () => {
      cancelled = true;
    };
  }, [candidateId, providerRaw]);

  return (
    <div className="glass-card p-6">
      <p className="text-sm font-semibold">Conectar cuenta</p>
      {state === "loading" ? <p className="mt-2 text-sm text-muted">Abriendo la app… si no está instalada, abriremos la web.</p> : null}
      {state === "error" ? <p className="mt-2 text-sm text-amber-300">{err}</p> : null}
      {state === "done" ? <p className="mt-2 text-sm text-muted">Si no abrió automáticamente, vuelve atrás y usa el enlace web.</p> : null}
    </div>
  );
}

