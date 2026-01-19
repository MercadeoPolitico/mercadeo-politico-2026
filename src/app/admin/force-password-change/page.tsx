import { Suspense } from "react";
import { ForcePasswordChangeClient } from "./ui";

export default function ForcePasswordChangePage() {
  return (
    <Suspense fallback={<div className="text-sm text-muted">Cargando…</div>}>
      <ForcePasswordChangeClient />
    </Suspense>
  );
}

