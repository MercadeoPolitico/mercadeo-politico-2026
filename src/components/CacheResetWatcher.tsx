"use client";

import { useEffect } from "react";

const LS_KEY = "mp26_cache_version";

export function CacheResetWatcher() {
  useEffect(() => {
    let cancelled = false;

    async function run() {
      try {
        const res = await fetch("/api/cache/version", { cache: "no-store" });
        const json = (await res.json().catch(() => null)) as { ok?: unknown; version?: unknown } | null;
        const v = typeof json?.version === "string" ? json.version.trim() : "";
        if (!v || cancelled) return;

        const last = window.localStorage.getItem(LS_KEY) ?? "";
        if (last && last === v) return;

        // First visit: store and do nothing. (Avoid surprise reloads on first load.)
        if (!last) {
          window.localStorage.setItem(LS_KEY, v);
          return;
        }

        // Version changed: clear cache/storage via browser-supported header.
        window.localStorage.setItem(LS_KEY, v);
        const next = `${window.location.pathname}${window.location.search}${window.location.hash}`;
        window.location.assign(`/api/cache/clear?next=${encodeURIComponent(next)}`);
      } catch {
        // ignore
      }
    }

    void run();
    return () => {
      cancelled = true;
    };
  }, []);

  return null;
}

