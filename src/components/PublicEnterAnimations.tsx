"use client";

import { useEffect } from "react";

/**
 * Ensures public-page entrance animations reliably trigger.
 *
 * Why: browser bfcache / fast navigations can skip CSS animations if the class
 * is already present at paint time. We toggle a global class after mount.
 */
export function PublicEnterAnimations() {
  useEffect(() => {
    const el = document.documentElement;

    const kick = () => {
      el.classList.remove("mp26-boot");
      // Force reflow so re-adding the class re-triggers CSS animations.
      // eslint-disable-next-line @typescript-eslint/no-unused-expressions
      el.offsetHeight;
      el.classList.add("mp26-boot");
    };

    kick();

    // Handle bfcache restores (Safari/Chrome/Edge).
    const onPageShow = () => kick();
    window.addEventListener("pageshow", onPageShow);
    return () => window.removeEventListener("pageshow", onPageShow);
  }, []);

  return null;
}

