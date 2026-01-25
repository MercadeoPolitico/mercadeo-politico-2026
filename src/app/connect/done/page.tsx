import { PublicPageShell } from "@/components/PublicPageShell";
import { Section } from "@/components/Section";

export default async function ConnectDonePage({
  searchParams,
}: {
  searchParams: Promise<{ ok?: string; provider?: string; candidate_id?: string; count?: string; error?: string }>;
}) {
  const sp = await searchParams;
  const ok = String(sp.ok ?? "") === "1";
  const provider = String(sp.provider ?? "").trim();
  const count = sp.count ? Number(sp.count) : null;
  const error = String(sp.error ?? "").trim();

  return (
    <PublicPageShell className="space-y-10">
      <Section
        title={ok ? "Conexión completada" : "No fue posible conectar"}
        subtitle={ok ? "Ya puedes cerrar esta página." : "Intenta de nuevo o contacta al admin."}
      >
        <div className="glass-card p-6">
          <p className="text-sm font-semibold">Proveedor: {provider || "—"}</p>
          {ok ? (
            <p className="mt-2 text-sm text-muted">
              Conexión registrada{typeof count === "number" ? ` (objetivos: ${count})` : ""}. Ya puedes cerrar esta página.
            </p>
          ) : (
            <p className="mt-2 text-sm text-muted">
              Motivo: <span className="text-foreground">{error || "desconocido"}</span>
            </p>
          )}
        </div>
      </Section>
    </PublicPageShell>
  );
}

