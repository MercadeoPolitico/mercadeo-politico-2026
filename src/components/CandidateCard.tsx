type Props = {
  name: string;
  office: "Senado" | "Cámara" | string;
  party: string;
  ballotNumber: string;
};

export function CandidateCard({ name, office, party, ballotNumber }: Props) {
  return (
    <article className="rounded-2xl border border-border bg-surface p-6">
      <div className="flex items-start justify-between gap-4">
        <div className="space-y-1">
          <h3 className="text-lg font-semibold">{name}</h3>
          <p className="text-sm text-muted">
            {office} · {party}
          </p>
        </div>
        <div className="rounded-full bg-foreground px-3 py-1 text-xs font-semibold text-background">
          No. {ballotNumber}
        </div>
      </div>
      <p className="mt-4 text-sm text-muted">
        Espacio listo para enlazar propuestas, biografía, agenda, y canales oficiales (cuando estén disponibles).
      </p>
    </article>
  );
}

