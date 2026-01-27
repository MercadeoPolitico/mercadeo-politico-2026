"use client";

import { useEffect, useMemo, useRef, useState } from "react";

type Props = {
  className?: string;
  children: React.ReactNode;
  /**
   * Optional stable key to re-trigger the animation when it changes.
   * Example: candidateId or route segment.
   */
  replayKey?: string;
};

/**
 * Adds a CSS class when the container becomes visible.
 * This makes entrance animations reliably noticeable (even if the page was cached).
 */
export function Mp26EnterOnView({ className, children, replayKey }: Props) {
  const ref = useRef<HTMLDivElement | null>(null);
  const [active, setActive] = useState(false);

  const rk = useMemo(() => String(replayKey ?? "").trim(), [replayKey]);

  useEffect(() => {
    setActive(false);
  }, [rk]);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    let cancelled = false;
    let didActivate = false;

    const activate = () => {
      if (cancelled || didActivate) return;
      didActivate = true;
      // Next paint → start animations.
      requestAnimationFrame(() => {
        if (!cancelled) setActive(true);
      });
    };

    // If already in view, activate quickly.
    const rect = el.getBoundingClientRect();
    if (rect.top < window.innerHeight * 0.92) {
      activate();
      return () => {
        cancelled = true;
      };
    }

    const io = new IntersectionObserver(
      (entries) => {
        const entry = entries[0];
        if (entry?.isIntersecting) activate();
      },
      { root: null, threshold: 0.12, rootMargin: "0px 0px -10% 0px" },
    );
    io.observe(el);

    return () => {
      cancelled = true;
      io.disconnect();
    };
  }, [rk]);

  return (
    <div ref={ref} className={["mp26-enter", active ? "mp26-enter-active" : "", className].filter(Boolean).join(" ")}>
      {children}
    </div>
  );
}

