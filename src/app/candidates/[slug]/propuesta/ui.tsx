"use client";

import { useEffect } from "react";
import { useParams, useSearchParams, useRouter } from "next/navigation";
import { PixelFire } from "@/components/analytics/PixelFire";

export function ProposalRedirectClient() {
  const router = useRouter();
  const params = useParams<{ slug: string }>();
  const search = useSearchParams();

  const slug = params.slug;
  const ref = search.get("ref") ?? undefined;
  const refType = ref === "shared" ? ("shared" as const) : ref === "social" ? ("social" as const) : ref === "direct" ? ("direct" as const) : undefined;

  useEffect(() => {
    // Redirect after mount so the pixel fires exactly once.
    router.replace(`/candidates/${encodeURIComponent(slug)}#propuesta`);
  }, [router, slug]);

  return (
    <>
      <PixelFire candidateSlug={slug} eventType="proposal_view" refType={refType} />
      <div className="text-sm text-muted">Redirigiendo…</div>
    </>
  );
}

