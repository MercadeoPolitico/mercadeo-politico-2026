import Link from "next/link";

type Props = {
  name: string;
  role: string;
  ballotNumber: number;
  region: string;
  party?: string;
  shortBio?: string;
  href?: string;
};

export function CandidateCard({ name, role, ballotNumber, region, party, shortBio, href }: Props) {
  return (
    <article className="rounded-2xl border border-border bg-surface p-6">
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
    </article>
  );
}

