"use client";

import { useEffect, useRef } from "react";

type EventType = "profile_view" | "proposal_view" | "social_click" | "shared_link_visit";
type RefType = "direct" | "social" | "shared";

export function PixelFire({
  candidateSlug,
  eventType,
  refType,
}: {
  candidateSlug: string;
  eventType: EventType;
  refType?: RefType;
}) {
  const fired = useRef(false);

  useEffect(() => {
    if (fired.current) return;
    fired.current = true;

    void fetch("/api/pixel/event", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        candidate_slug: candidateSlug,
        event_type: eventType,
        source: "web",
        ...(refType ? { ref: refType } : {}),
      }),
      // Avoid loops and caching
      cache: "no-store",
      keepalive: true,
    }).catch(() => {
      // silent: never log
    });
  }, [candidateSlug, eventType, refType]);

  return null;
}

