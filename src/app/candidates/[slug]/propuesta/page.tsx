import { Suspense } from "react";
import { PublicPageShell } from "@/components/PublicPageShell";
import { ProposalRedirectClient } from "./ui";

export default function CandidateProposalPage() {
  return (
    <PublicPageShell className="space-y-6">
      <div className="glass-card p-6">
        <Suspense>
          <ProposalRedirectClient />
        </Suspense>
      </div>
    </PublicPageShell>
  );
}

