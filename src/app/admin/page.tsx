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
  const openAiEnabled = envOn("OPENAI_ENABLED") && has("OPENAI_API_KEY");
  const n8nForwardEnabled = envOn("N8N_FORWARD_ENABLED") && has("N8N_WEBHOOK_URL") && has("N8N_WEBHOOK_TOKEN");

  // Best-effort counts (requires tables + policies)
  let draftsCount: string = "—";
  let draftsApproved: string = "—";
  let draftsSent: string = "—";
  let pubsPending: string = "—";
  let pubsApproved: string = "—";
  let pubsSent: string = "—";
  try {
    const supabase = await createSupabaseServerClient();
    if (supabase) {
      const [{ count: all }, { count: approved }, { count: sent }, { count: pPending }, { count: pApproved }, { count: pSent }] =
        await Promise.all([
          supabase.from("ai_drafts").select("*", { count: "exact", head: true }),
          supabase.from("ai_drafts").select("*", { count: "exact", head: true }).eq("status", "approved"),
          supabase.from("ai_drafts").select("*", { count: "exact", head: true }).eq("status", "sent_to_n8n"),
          supabase.from("politician_publications").select("*", { count: "exact", head: true }).eq("status", "pending_approval"),
          supabase.from("politician_publications").select("*", { count: "exact", head: true }).eq("status", "approved"),
          supabase.from("politician_publications").select("*", { count: "exact", head: true }).eq("status", "sent_to_n8n"),
        ]);

      if (typeof all === "number") draftsCount = String(all);
      if (typeof approved === "number") draftsApproved = String(approved);
      if (typeof sent === "number") draftsSent = String(sent);
      if (typeof pPending === "number") pubsPending = String(pPending);
      if (typeof pApproved === "number") pubsApproved = String(pApproved);
      if (typeof pSent === "number") pubsSent = String(pSent);
    }
  } catch {
    // keep as "—" (no logs)
  }

  return (
    <div className="space-y-10">
      <Section title="Dashboard" subtitle={`Acceso: ${role}. Métricas en modo lectura (fase inicial).`}>
        <div className="grid gap-4 md:grid-cols-4">
          <div className="glass-card p-5">
            <p className="text-xs text-muted">Borradores (ai_drafts)</p>
            <p className="mt-1 text-2xl font-semibold">{draftsCount}</p>
          </div>
          <div className="glass-card p-5">
            <p className="text-xs text-muted">Aprobados (ai_drafts)</p>
            <p className="mt-1 text-2xl font-semibold">{draftsApproved}</p>
          </div>
          <div className="glass-card p-5">
            <p className="text-xs text-muted">Enviados a n8n (ai_drafts)</p>
            <p className="mt-1 text-2xl font-semibold">{draftsSent}</p>
          </div>
          <div className="glass-card p-5">
            <p className="text-xs text-muted">Publicaciones (pendientes/aprobadas/enviadas)</p>
            <p className="mt-1 text-2xl font-semibold">
              {pubsPending} / {pubsApproved} / {pubsSent}
            </p>
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
        <div className="grid gap-4 md:grid-cols-3">
          <div className="glass-card p-6">
            <p className="text-sm font-semibold">Synthetic Intelligence</p>
            <div className="mt-2 flex items-center justify-between gap-3">
              <p className="text-xs text-muted">Actuation</p>
              <span className={`si-meter ${marlenyEnabled ? "si-meter--on" : "si-meter--off"}`}>
                <span className="si-bar" />
                <span className="si-bar" />
                <span className="si-bar" />
                <span className="si-bar" />
              </span>
            </div>
            <p className="mt-2 text-sm text-muted">{marlenyEnabled ? "Activo" : "Inactivo"}</p>
          </div>
          <div className="glass-card p-6">
            <p className="text-sm font-semibold">Synthetic Intelligence</p>
            <div className="mt-2 flex items-center justify-between gap-3">
              <p className="text-xs text-muted">Volume</p>
              <span className={`si-meter ${openAiEnabled ? "si-meter--on" : "si-meter--off"}`}>
                <span className="si-bar" />
                <span className="si-bar" />
                <span className="si-bar" />
                <span className="si-bar" />
              </span>
            </div>
            <p className="mt-2 text-sm text-muted">{openAiEnabled ? "Activo" : "Inactivo"}</p>
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

