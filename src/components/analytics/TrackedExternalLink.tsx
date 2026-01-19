"use client";

import type { ReactNode } from "react";

type RefType = "direct" | "social" | "shared";

export function TrackedExternalLink({
  candidateSlug,
  href,
  refType = "social",
  children,
  className,
}: {
  candidateSlug: string;
  href: string;
  refType?: RefType;
  className?: string;
  children: ReactNode;
}) {
  return (
    <a
      className={className}
      href={href}
      target="_blank"
      rel="noreferrer"
      onClick={() => {
        // fire-and-forget
        void fetch("/api/pixel/event", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            candidate_slug: candidateSlug,
            event_type: "social_click",
            source: "web",
            ref: refType,
          }),
          cache: "no-store",
          keepalive: true,
        }).catch(() => {});
      }}
    >
      {children}
    </a>
  );
}

