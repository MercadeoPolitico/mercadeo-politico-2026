"use client";

import { useCallback, useMemo, useState } from "react";

function buildAbsoluteUrl(pathname: string): string {
  try {
    const origin = window.location.origin;
    return `${origin}${pathname.startsWith("/") ? "" : "/"}${pathname}`;
  } catch {
    return pathname;
  }
}

export function CiPostActions({ slug, title }: { slug: string; title: string }) {
  const [msg, setMsg] = useState<string | null>(null);

  const publicUrl = useMemo(() => buildAbsoluteUrl(`/centro-informativo#${encodeURIComponent(slug)}`), [slug]);

  const copy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(publicUrl);
      setMsg("URL copiada.");
      window.setTimeout(() => setMsg(null), 1600);
    } catch {
      setMsg("No fue posible copiar. Mantén presionado y copia manualmente.");
      window.setTimeout(() => setMsg(null), 2400);
    }
  }, [publicUrl]);

  const xIntent = useMemo(() => {
    const text = `${String(title || "").trim()}\n\n${publicUrl}`.slice(0, 260);
    const u = new URL("https://twitter.com/intent/tweet");
    u.searchParams.set("text", text);
    return u.toString();
  }, [publicUrl, title]);

  const fbShare = useMemo(() => {
    const u = new URL("https://www.facebook.com/sharer/sharer.php");
    u.searchParams.set("u", publicUrl);
    return u.toString();
  }, [publicUrl]);

  return (
    <div className="flex flex-wrap items-center gap-2">
      <button className="glass-button" type="button" onClick={copy}>
        Copiar URL
      </button>
      <a className="glass-button" href={xIntent} target="_blank" rel="noreferrer">
        Compartir en X
      </a>
      <a className="glass-button" href={fbShare} target="_blank" rel="noreferrer">
        Compartir en Facebook
      </a>
      {msg ? <span className="text-xs text-muted">{msg}</span> : null}
    </div>
  );
}

