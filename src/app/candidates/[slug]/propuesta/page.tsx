import { Suspense } from "react";
import { ProposalRedirectClient } from "./ui";

export default function CandidateProposalPage() {
  return (
    <Suspense>
      <ProposalRedirectClient />
    </Suspense>
  );
}

