type Props = {
  title?: string;
  subtitle?: string;
  children: React.ReactNode;
};

export function Section({ title, subtitle, children }: Props) {
  return (
    <section className="space-y-4">
      {(title || subtitle) && (
        <header className="space-y-1">
          {title && <h2 className="text-2xl font-semibold tracking-tight">{title}</h2>}
          {subtitle && <p className="text-sm text-muted">{subtitle}</p>}
        </header>
      )}
      {children}
    </section>
  );
}

