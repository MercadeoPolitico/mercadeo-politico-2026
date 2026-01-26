import { Section } from "@/components/Section";
import { getCandidates } from "@/lib/candidates/getCandidates";
import { requireAdmin } from "@/lib/auth/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { CacheResetCard } from "./CacheResetCard";

type Trend = "sube" | "estable" | "baja";

function envOn(name: string): boolean {
  return process.env[name] === "true";
}

function has(name: string): boolean {
  const v = process.env[name];
  return Boolean(v && v.trim().length);
}

function hasAny(...names: string[]): boolean {
  return names.some((n) => has(n));
}

function envNotFalse(name: string): boolean {
  return process.env[name] !== "false";
}

function trendFromWindows(curr: number, prev: number): Trend {
  if (curr === 0 && prev === 0) return "estable";
  if (prev === 0 && curr > 0) return "sube";

  const diff = curr - prev;
  const rel = diff / Math.max(prev, 1);

  if (rel > 0.2 && diff >= 2) return "sube";
  if (rel < -0.2 && diff <= -2) return "baja";
  return "estable";
}

export default async function AdminDashboardPage() {
  const { role } = await requireAdmin();
  const candidates = await getCandidates();

  // Read-only, best-effort status (no secrets)
  // Continuity-first: accept common env aliases and treat "configured" as active unless explicitly disabled.
  const marlenyEnabled =
    envNotFalse("MARLENY_AI_ENABLED") &&
    hasAny("MARLENY_AI_ENDPOINT", "MARLENY_ENDPOINT", "MARLENY_API_URL") &&
    hasAny("MARLENY_AI_API_KEY", "MARLENY_API_KEY", "MARLENY_TOKEN");

  const openAiEnabled = envNotFalse("OPENAI_ENABLED") && has("OPENAI_API_KEY");

  const n8nForwardEnabled =
    envNotFalse("N8N_FORWARD_ENABLED") &&
    hasAny("N8N_WEBHOOK_URL", "WEBHOOK_URL") &&
    hasAny("N8N_WEBHOOK_TOKEN", "WEBHOOK_TOKEN", "MP26_AUTOMATION_TOKEN", "AUTOMATION_API_TOKEN");

  // Best-effort counts (requires tables + policies)
  let draftsCount: string = "—";
  let draftsApproved: string = "—";
  let draftsSent: string = "—";
  let pubsPending: string = "—";
  let pubsApproved: string = "—";
  let pubsSent: string = "—";
  let socialInteractions7d: string = "—";
  let socialTrend: Trend | "—" = "—";
  let socialClicks7d: string = "—";
  let sharedVisits7d: string = "—";
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

      // Interacción desde redes (analytics_events): últimos 7 días vs 7 días previos
      const dayMs = 24 * 60 * 60 * 1000;
      const nowMs = Date.now();
      const startCurrIso = new Date(nowMs - 7 * dayMs).toISOString();
      const startPrevIso = new Date(nowMs - 14 * dayMs).toISOString();

      const [
        { count: clicksCurr },
        { count: sharedCurr },
        { count: clicksPrev },
        { count: sharedPrev },
      ] = await Promise.all([
        supabase.from("analytics_events").select("*", { count: "exact", head: true }).eq("event_type", "social_click").gte("occurred_at", startCurrIso),
        supabase
          .from("analytics_events")
          .select("*", { count: "exact", head: true })
          .eq("event_type", "shared_link_visit")
          .gte("occurred_at", startCurrIso),
        supabase
          .from("analytics_events")
          .select("*", { count: "exact", head: true })
          .eq("event_type", "social_click")
          .gte("occurred_at", startPrevIso)
          .lt("occurred_at", startCurrIso),
        supabase
          .from("analytics_events")
          .select("*", { count: "exact", head: true })
          .eq("event_type", "shared_link_visit")
          .gte("occurred_at", startPrevIso)
          .lt("occurred_at", startCurrIso),
      ]);

      if (typeof clicksCurr === "number" && typeof sharedCurr === "number") {
        socialClicks7d = String(clicksCurr);
        sharedVisits7d = String(sharedCurr);
        socialInteractions7d = String(clicksCurr + sharedCurr);
      }
      if (typeof clicksCurr === "number" && typeof sharedCurr === "number" && typeof clicksPrev === "number" && typeof sharedPrev === "number") {
        socialTrend = trendFromWindows(clicksCurr + sharedCurr, clicksPrev + sharedPrev);
      }
    }
  } catch {
    // keep as "—" (no logs)
  }

  return (
    <div className="space-y-10">
      <Section title="Dashboard" subtitle={`Acceso: ${role}. Métricas en modo lectura (fase inicial).`}>
        <div className="grid gap-4 md:grid-cols-5">
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
          <div className="glass-card p-5">
            <p className="text-xs text-muted">Interacción desde redes (7 días)</p>
            <p className="mt-1 text-2xl font-semibold">{socialInteractions7d}</p>
            <p className="mt-1 text-xs text-muted">
              Tendencia: <span className="text-foreground">{socialTrend}</span> · Clicks:{" "}
              <span className="text-foreground">{socialClicks7d}</span> · Compartidos:{" "}
              <span className="text-foreground">{sharedVisits7d}</span>
            </p>
          </div>
        </div>
        <div className="mt-4">
          <CacheResetCard />
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

