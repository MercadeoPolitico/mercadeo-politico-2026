type Props = {
  children: React.ReactNode;
  /** Extra classes for the page wrapper (visual-only). */
  className?: string;
};

/**
 * Public-only visual shell (glassmorphism backdrop).
 * This is intentionally NOT used by /admin/*.
 */
export function PublicPageShell({ children, className }: Props) {
  return (
    <div className={["relative isolate", className].filter(Boolean).join(" ")}>
      <div aria-hidden className="public-backdrop-layer" />
      <div aria-hidden className="public-stars-layer" />
      <div aria-hidden className="public-vignette-layer" />
      <div className="relative z-10">{children}</div>
    </div>
  );
}

