import { PublicPageShell } from "@/components/PublicPageShell";
import { Section } from "@/components/Section";

function errorMessage(error: string): { title: string; body: string } {
  const e = error.toLowerCase();
  if (e === "state_expired") return { title: "Enlace caducado", body: "Este enlace ya no es válido (caduca en 30 minutos). Pide al administrador que te envíe un nuevo enlace por WhatsApp." };
  if (e === "invalid_state" || e === "state_already_used") return { title: "Enlace no válido", body: "Este enlace ya se usó o no es válido. Pide un nuevo enlace al administrador." };
  if (e === "missing_code_or_state") return { title: "Faltan datos", body: "Meta o X no devolvieron los datos necesarios. Vuelve a intentar desde el enlace que te enviaron." };
  if (e === "missing_pkce_verifier") return { title: "Sesión de X caducada", body: "Abre de nuevo el enlace que te enviaron (en el mismo navegador) y completa la autorización de X." };
  if (e.includes("token") || e.includes("exchange")) return { title: "Error al conectar", body: "No se pudo completar la autorización con el proveedor. Pide un nuevo enlace y vuelve a intentar." };
  return { title: "No fue posible conectar", body: `Motivo: ${error || "desconocido"}. Pide un nuevo enlace al administrador.` };
}

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
  const errInfo = !ok && error ? errorMessage(error) : null;

  return (
    <PublicPageShell className="space-y-10">
      <Section
        title={ok ? "Conexión completada" : (errInfo?.title ?? "No fue posible conectar")}
        subtitle={ok ? "Ya puedes cerrar esta página." : (errInfo ? "Solución abajo." : "Intenta de nuevo o contacta al admin.")}
      >
        <div className="glass-card p-6">
          <p className="text-sm font-semibold">Proveedor: {provider || "—"}</p>
          {ok ? (
            <p className="mt-2 text-sm text-muted">
              Conexión registrada{typeof count === "number" ? ` (objetivos: ${count})` : ""}. Ya puedes cerrar esta página.
            </p>
          ) : (
            <p className="mt-2 text-sm text-muted">
              {errInfo ? errInfo.body : `Motivo: ${error || "desconocido"}`}
            </p>
          )}
        </div>
      </Section>
    </PublicPageShell>
  );
}

