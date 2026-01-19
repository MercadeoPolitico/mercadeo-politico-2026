import { Section } from "@/components/Section";
import { getCandidates } from "@/lib/candidates/getCandidates";
import { requireAdmin } from "@/lib/auth/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";

function envOn(name: string): boolean {
  return process.env[name] === "true";
}

function has(name: string): boolean {
  const v = process.env[name];
  return Boolean(v && v.trim().length);
}

export default async function AdminDashboardPage() {
  const { role } = await requireAdmin();
  const candidates = getCandidates();

  // Read-only, best-effort status (no secrets)
  const marlenyEnabled = envOn("MARLENY_AI_ENABLED") && has("MARLENY_AI_API_KEY") && has("MARLENY_AI_ENDPOINT");
  const n8nForwardEnabled = envOn("N8N_FORWARD_ENABLED") && has("N8N_WEBHOOK_URL") && has("N8N_WEBHOOK_TOKEN");

  // Best-effort counts (requires ai_drafts table + policies)
  let draftsCount: string = "—";
  try {
    const supabase = await createSupabaseServerClient();
    if (supabase) {
      const { count } = await supabase.from("ai_drafts").select("*", { count: "exact", head: true });
      if (typeof count === "number") draftsCount = String(count);
    }
  } catch {
    // keep as "—" (no logs)
  }

  return (
    <div className="space-y-10">
      <Section title="Dashboard" subtitle={`Acceso: ${role}. Métricas en modo lectura (fase inicial).`}>
        <div className="grid gap-4 md:grid-cols-4">
          <div className="glass-card p-5">
            <p className="text-xs text-muted">Total visitas</p>
            <p className="mt-1 text-2xl font-semibold">—</p>
          </div>
          <div className="glass-card p-5">
            <p className="text-xs text-muted">Vistas perfiles</p>
            <p className="mt-1 text-2xl font-semibold">—</p>
          </div>
          <div className="glass-card p-5">
            <p className="text-xs text-muted">Vistas propuestas</p>
            <p className="mt-1 text-2xl font-semibold">—</p>
          </div>
          <div className="glass-card p-5">
            <p className="text-xs text-muted">Borradores blog</p>
            <p className="mt-1 text-2xl font-semibold">{draftsCount}</p>
          </div>
        </div>
      </Section>

      <Section title="Candidatos" subtitle="Accesos internos rápidos.">
        <div className="grid gap-4 md:grid-cols-2">
          {candidates.map((c) => (
            <div key={c.id} className="glass-card p-6">
              <p className="text-sm font-semibold">{c.name}</p>
              <p className="mt-1 text-sm text-muted">{c.role}</p>
              <p className="mt-1 text-xs text-muted">Meta · No. {c.ballotNumber}</p>
            </div>
          ))}
        </div>
      </Section>

      <Section title="Automatización" subtitle="Estado de integraciones (solo lectura).">
        <div className="grid gap-4 md:grid-cols-2">
          <div className="glass-card p-6">
            <p className="text-sm font-semibold">Marleny AI</p>
            <p className="mt-1 text-sm text-muted">{marlenyEnabled ? "Habilitado" : "Deshabilitado"}</p>
          </div>
          <div className="glass-card p-6">
            <p className="text-sm font-semibold">n8n forwarding</p>
            <p className="mt-1 text-sm text-muted">{n8nForwardEnabled ? "Habilitado" : "Deshabilitado"}</p>
          </div>
        </div>
      </Section>
    </div>
  );
}

