import { redirect } from "next/navigation";
import { PublicPageShell } from "@/components/PublicPageShell";
import { Section } from "@/components/Section";
import { oauthClientConfig, isOAuthProvider } from "@/lib/oauth/providers";

export const runtime = "nodejs";

function providerLabel(p: string): string {
  if (p === "meta") return "Meta (Facebook/Instagram)";
  if (p === "x") return "X (Twitter)";
  if (p === "reddit") return "Reddit";
  return p;
}

export default async function ConnectProviderPage({
  params,
  searchParams,
}: {
  params: Promise<{ provider: string }>;
  searchParams: Promise<{ candidate_id?: string }>;
}) {
  const { provider } = await params;
  const sp = await searchParams;
  const candidateId = String(sp?.candidate_id ?? "").trim();

  if (!isOAuthProvider(provider)) {
    return (
      <PublicPageShell className="space-y-10">
        <Section title="Conexión no disponible" subtitle="Proveedor inválido.">
          <div className="glass-card p-6 text-sm text-muted">Este enlace no es válido.</div>
        </Section>
      </PublicPageShell>
    );
  }

  if (!candidateId) {
    return (
      <PublicPageShell className="space-y-10">
        <Section title="Conexión no disponible" subtitle="Falta el candidato asociado.">
          <div className="glass-card p-6 text-sm text-muted">Solicita un nuevo enlace al administrador.</div>
        </Section>
      </PublicPageShell>
    );
  }

  const cfg = oauthClientConfig(provider);
  const hasEncKey = Boolean(String(process.env.OAUTH_TOKEN_ENCRYPTION_KEY ?? "").trim());

  if (!cfg.configured || !hasEncKey) {
    return (
      <PublicPageShell className="space-y-10">
        <Section title="Conexión temporalmente no disponible" subtitle="Aún no se configuró la conexión OAuth en este entorno.">
          <div className="glass-card p-6">
            <p className="text-sm font-semibold">{providerLabel(provider)}</p>
            <p className="mt-2 text-sm text-muted">
              Este enlace está listo, pero falta configurar credenciales del proveedor en el servidor. Intenta más tarde o contacta al admin.
            </p>
          </div>
        </Section>
      </PublicPageShell>
    );
  }

  // Start OAuth immediately.
  redirect(`/api/public/oauth/${encodeURIComponent(provider)}/start?candidate_id=${encodeURIComponent(candidateId)}`);
}

