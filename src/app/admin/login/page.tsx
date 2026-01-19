import { Suspense } from "react";
import { AdminLoginClient } from "./ui";

export default function AdminLoginPage() {
  return (
    <Suspense fallback={<div className="text-sm text-muted">Cargando…</div>}>
      <AdminLoginClient />
    </Suspense>
  );
}

