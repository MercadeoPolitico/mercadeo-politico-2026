"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams, useSearchParams } from "next/navigation";
import { normalizeOAuthProvider, type OAuthProvider } from "@/lib/oauth/providers";

function buildAppDeepLink(provider: OAuthProvider, authUrl: string): { appUrl: string; fallbackUrl: string } {
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

export default function ConnectProviderAppPage() {
  const params = useParams();
  const sp = useSearchParams();
  const providerRaw = String(params?.provider ?? "").trim();
  const candidateId = useMemo(() => String(sp.get("candidate_id") ?? "").trim(), [sp]);

  const [state, setState] = useState<"idle" | "loading" | "done" | "error">("idle");
  const [err, setErr] = useState<string>("");
  const [urls, setUrls] = useState<{ appUrl: string; fallbackUrl: string } | null>(null);

  function tryOpen(next: { appUrl: string; fallbackUrl: string }) {
    // Attempt app first; fallback to web.
    // Note: browsers don't reliably tell us if the app opened, so we use a short timer.
    const started = Date.now();
    window.location.href = next.appUrl;
    window.setTimeout(() => {
      if (Date.now() - started < 2500) window.location.href = next.fallbackUrl;
    }, 1200);
  }

  useEffect(() => {
    const provider = normalizeOAuthProvider(providerRaw);
    if (!provider) {
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
    setUrls(null);

    void (async () => {
      const url = `/api/public/oauth/${encodeURIComponent(provider)}/link?candidate_id=${encodeURIComponent(candidateId)}`;
      const res = await fetch(url, { method: "GET", cache: "no-store" }).catch(() => null);
      const j = (await res?.json().catch(() => null)) as any;
      if (cancelled) return;
      if (!res || !res.ok || !j?.ok || typeof j?.auth_url !== "string") {
        setState("error");
        const reason =
          typeof j?.error === "string"
            ? j.error === "not_configured"
              ? "Falta configuración OAuth en el servidor."
              : j.error
            : "desconocido";
        setErr(`Conexión no disponible. Motivo: ${reason}`);
        return;
      }

      const authUrl = String(j.auth_url).trim();
      if (!authUrl) {
        setState("error");
        setErr("Conexión no disponible (auth_url vacío).");
        return;
      }

      const { appUrl, fallbackUrl } = buildAppDeepLink(provider, authUrl);
      setUrls({ appUrl, fallbackUrl });

      // Auto-attempt (best-effort). Some in-app browsers (WhatsApp/IG) may block auto deep-linking.
      tryOpen({ appUrl, fallbackUrl });

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
      {state === "done" ? (
        <div className="mt-3 space-y-3">
          <p className="text-sm text-muted">Si no abrió automáticamente, usa los botones:</p>
          <div className="flex flex-col gap-2 sm:flex-row">
            <button
              className="glass-button"
              type="button"
              onClick={() => {
                if (!urls) return;
                tryOpen(urls);
              }}
              disabled={!urls}
            >
              Abrir app (reintentar)
            </button>
            <a
              className="glass-button"
              href={urls?.fallbackUrl || "#"}
              onClick={(e) => {
                if (!urls?.fallbackUrl) e.preventDefault();
              }}
            >
              Continuar en web
            </a>
          </div>
          <p className="text-xs text-muted">
            Nota: algunos navegadores dentro de WhatsApp bloquean abrir apps automáticamente; por eso dejamos el reintento manual.
          </p>
        </div>
      ) : null}
    </div>
  );
}

