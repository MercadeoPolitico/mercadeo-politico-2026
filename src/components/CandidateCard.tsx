import Link from "next/link";

type Props = {
  name: string;
  role: string;
  ballotNumber: number;
  region: string;
  party?: string;
  shortBio?: string;
  photoUrl?: string | null;
  /** Used to create deterministic "fly-in" animation variants. */
  enterIndex?: number;
  href?: string;
  proposalHref?: string;
};

export function CandidateCard({ name, role, ballotNumber, region, party, shortBio, photoUrl, enterIndex, href, proposalHref }: Props) {
  const proposalLink = proposalHref ?? (href ? `${href}#propuesta` : undefined);
  const idx = typeof enterIndex === "number" && Number.isFinite(enterIndex) ? Math.max(0, Math.floor(enterIndex)) : 0;
  const from = (() => {
    // 4 deterministic directions/rotations (no randomness, stable SSR)
    const m = idx % 4;
    if (m === 0) return { x: -64, y: 42, r: -10 };
    if (m === 1) return { x: 72, y: 28, r: 12 };
    if (m === 2) return { x: -48, y: -34, r: 9 };
    return { x: 58, y: -46, r: -12 };
  })();
  return (
    <article className="glass-card p-6">
      <div className="flex items-start justify-between gap-4">
        <div className="flex min-w-0 items-start gap-4">
          {photoUrl ? (
            <div
              className="candidate-photo-wrap"
              style={
                {
                  // Used by CSS keyframes to animate the photo in.
                  ["--mp26-photo-from-x" as any]: `${from.x}px`,
                  ["--mp26-photo-from-y" as any]: `${from.y}px`,
                  ["--mp26-photo-from-r" as any]: `${from.r}deg`,
                  ["--mp26-photo-delay" as any]: `${idx * 90}ms`,
                } as any
              }
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={photoUrl} alt={`Foto de ${name}`} className="candidate-photo" loading="lazy" />
            </div>
          ) : null}
          <div className="min-w-0 space-y-1">
          <h3 className="text-lg font-semibold">
            {href ? (
              <Link className="underline-offset-4 hover:underline" href={href}>
                {name}
              </Link>
            ) : (
              name
            )}
          </h3>
          <p className="text-sm text-muted">{role + (party ? ` · ${party}` : "")}</p>
          <p className="text-xs text-muted">Región: {region}</p>
        </div>
        </div>
        <div className="rounded-full bg-foreground px-3 py-1 text-xs font-semibold text-background">
          No. {ballotNumber}
        </div>
      </div>
      {shortBio ? <p className="mt-4 text-sm text-muted">{shortBio}</p> : null}

      <div className="mt-5 flex flex-col gap-2 sm:flex-row sm:items-center">
        {proposalLink ? (
          <Link className="glass-button w-full sm:w-auto" href={proposalLink}>
            Ver propuesta
          </Link>
        ) : null}
      </div>
    </article>
  );
}

