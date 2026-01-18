import Link from "next/link";

type Props = {
  name: string;
  role: string;
  ballotNumber: number;
  region: string;
  party?: string;
  shortBio?: string;
  href?: string;
  proposalHref?: string;
};

export function CandidateCard({ name, role, ballotNumber, region, party, shortBio, href, proposalHref }: Props) {
  const proposalLink = proposalHref ?? (href ? `${href}#propuesta` : undefined);
  return (
    <article className="glass-card p-6">
      <div className="flex items-start justify-between gap-4">
        <div className="space-y-1">
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

