import { cookies } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { POLITICO_COOKIE_NAME, readPoliticoSessionCookieValue } from "@/lib/politico/session";
import { computeCitizenPanelData } from "@/lib/analytics/citizenPanel";
export const runtime = "nodejs";

export default async function PoliticoWorkspacePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;

  const cookieStore = await cookies();
  const session = readPoliticoSessionCookieValue(cookieStore.get(POLITICO_COOKIE_NAME)?.value);
  if (!session) redirect("/politico/access");

  const admin = createSupabaseAdminClient();
  if (!admin) {
    return (
      <div className="mx-auto w-full max-w-lg space-y-2">
        <h1 className="text-2xl font-semibold tracking-tight">No disponible</h1>
        <p className="text-sm text-muted">El portal no está configurado en este entorno.</p>
      </div>
    );
  }

  const { data: politician } = await admin
    .from("politicians")
    .select("id,slug,name,office,region,party,biography,proposals")
    .eq("slug", slug)
    .maybeSingle();
  if (!politician) notFound();
  if (politician.id !== session.politicianId) {
    return (
      <div className="mx-auto w-full max-w-lg space-y-2">
        <h1 className="text-2xl font-semibold tracking-tight">Acceso denegado</h1>
        <p className="text-sm text-muted">Este enlace no corresponde a este político.</p>
      </div>
    );
  }

  const [{ data: links }, { data: pending }, { data: events }] = await Promise.all([
    admin
      .from("politician_social_links")
      .select("platform,handle,url,status")
      .eq("politician_id", politician.id)
      .eq("status", "active")
      .order("created_at", { ascending: true }),
    admin
      .from("politician_publications")
      .select("id,platform,title,content,media_urls,status,created_at")
      .eq("politician_id", politician.id)
      .eq("status", "pending_approval")
      .order("created_at", { ascending: false })
      .limit(50),
    admin
      .from("analytics_events")
      .select("event_type,municipality,content_id,occurred_at")
      .eq("candidate_id", politician.id)
      .order("occurred_at", { ascending: false })
      .limit(400),
  ]);

  const safeLinks = (links ?? []) as { platform: string; handle: string | null; url: string; status: string }[];
  const safePending = (pending ?? []) as {
    id: string;
    platform: string;
    title: string | null;
    content: string;
    media_urls: string[] | null;
    status: string;
    created_at: string;
  }[];

  const safeEvents = (events ?? []) as {
    event_type: string;
    municipality: string | null;
    content_id: string | null;
    occurred_at: string;
  }[];

  // Load minimal publication text context for affinity classification (approved lifecycle only)
  const contentIds = Array.from(
    new Set(
      safeEvents
        .filter((e) => e.event_type === "approval_approved" || e.event_type === "automation_submitted")
        .map((e) => e.content_id)
        .filter((x): x is string => typeof x === "string" && x.length > 0),
    ),
  ).slice(0, 50);

  const publicationTextsById: Record<string, string> = {};
  if (contentIds.length) {
    const { data: pubs } = await admin
      .from("politician_publications")
      .select("id,content,variants,status")
      .in("id", contentIds)
      .in("status", ["approved", "sent_to_n8n", "scheduled", "published"]);

    for (const p of (pubs ?? []) as { id: string; content: string; variants: unknown }[]) {
      const extra = typeof p.variants === "object" && p.variants !== null ? JSON.stringify(p.variants) : "";
      publicationTextsById[p.id] = `${p.content}\n${extra}`;
    }
  }

  const panel = computeCitizenPanelData({ events: safeEvents, publicationTextsById });

  async function decide(formData: FormData) {
    "use server";

    const cookieStore = await cookies();
    const session = readPoliticoSessionCookieValue(cookieStore.get(POLITICO_COOKIE_NAME)?.value);
    if (!session) redirect("/politico/access");

    const admin = createSupabaseAdminClient();
    if (!admin) redirect("/politico/access");

    const publicationId = String(formData.get("publication_id") ?? "");
    const decision = String(formData.get("decision") ?? "");

    if (!publicationId || (decision !== "approved" && decision !== "rejected")) return;

    const { data: pub } = await admin
      .from("politician_publications")
      .select("id,politician_id,platform,content,media_urls")
      .eq("id", publicationId)
      .maybeSingle();
    if (!pub || pub.politician_id !== session.politicianId) return;

    const now = new Date().toISOString();

    // Update status
    await admin
      .from("politician_publications")
      .update({
        status: decision,
        decided_at: now,
        updated_at: now,
        decision_notes: null,
      })
      .eq("id", publicationId);

    // Analytics event (no PII). Only approved contributes to the citizen panel.
    try {
      await admin.from("analytics_events").insert({
        candidate_id: session.politicianId,
        event_type: decision === "approved" ? "approval_approved" : "approval_rejected",
        municipality: null,
        content_id: publicationId,
        occurred_at: now,
      });
    } catch {
      // no logs
    }

    redirect(`/politico/${slug}`);
  }

  return (
    <div className="space-y-10">
      <header className="space-y-2">
        <h1 className="text-2xl font-semibold tracking-tight">Workspace móvil</h1>
        <p className="text-sm text-muted">
          {politician.name} · {politician.office} · {politician.region}
        </p>
      </header>

      <section className="glass-card space-y-4 p-6">
        <div className="space-y-1">
          <h2 className="text-base font-semibold">Panel de Seguimiento Ciudadano</h2>
          <p className="text-sm text-muted">Resumen humano del impacto de su comunicación. Sin cifras, sin tecnicismos.</p>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <div className="rounded-2xl border border-border bg-background/60 p-5">
            <p className="text-xs font-semibold text-muted">1) Personas alcanzadas</p>
            <p className="mt-2 text-sm">
              En los últimos días, los mensajes han llegado a personas interesadas en conocer sus propuestas.
            </p>
            <p className="mt-2 text-sm text-muted">
              Tendencia: <span className="text-foreground">{panel.reachedTrend}</span>
            </p>
          </div>

          <div className="rounded-2xl border border-border bg-background/60 p-5">
            <p className="text-xs font-semibold text-muted">4) Mejores horarios</p>
            <p className="mt-2 text-sm text-muted">
              La ciudadanía suele interactuar más en{" "}
              <span className="text-foreground">{panel.bestTimeBlock}</span>.
            </p>
          </div>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <div className="rounded-2xl border border-border bg-background/60 p-5">
            <p className="text-xs font-semibold text-muted">2) Municipios con más interés</p>
            {panel.municipalities.length ? (
              <ul className="mt-3 space-y-1 text-sm">
                {panel.municipalities.slice(0, 5).map((m) => (
                  <li key={m} className="text-foreground">
                    {m}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-2 text-sm text-muted">Aún no hay señal suficiente por municipio.</p>
            )}
          </div>

          <div className="rounded-2xl border border-border bg-background/60 p-5">
            <p className="text-xs font-semibold text-muted">3) Contenidos con mayor afinidad</p>
            <p className="mt-2 text-sm text-muted">Estos tipos de mensajes generan mayor afinidad con la ciudadanía.</p>
            <ul className="mt-3 space-y-1 text-sm">
              {panel.affinityLabels.slice(0, 5).map((l) => (
                <li key={l} className="text-foreground">
                  {l}
                </li>
              ))}
            </ul>
          </div>
        </div>
      </section>

      <section className="glass-card space-y-3 p-6">
        <h2 className="text-base font-semibold">Enlaces</h2>
        <div className="grid gap-2 md:grid-cols-2">
          {safeLinks.map((l) => (
            <a key={`${l.platform}-${l.url}`} className="rounded-xl border border-border bg-background/60 p-4 underline" href={l.url} target="_blank" rel="noreferrer">
              <p className="text-sm font-semibold">{l.platform}</p>
              <p className="mt-1 text-xs text-muted">{l.handle ?? l.url}</p>
            </a>
          ))}
        </div>
        {safeLinks.length === 0 ? <p className="text-sm text-muted">Aún no hay enlaces configurados.</p> : null}
      </section>

      <section className="glass-card space-y-3 p-6">
        <h2 className="text-base font-semibold">Publicaciones pendientes</h2>
        <p className="text-sm text-muted">Aprueba o rechaza. La automatización se ejecuta después desde el panel admin.</p>

        <div className="grid gap-3">
          {safePending.map((p) => (
            <div key={p.id} className="rounded-2xl border border-border bg-background/60 p-5">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-sm font-semibold">{p.platform}</p>
                  {p.title ? <p className="mt-1 text-sm text-muted">{p.title}</p> : null}
                </div>
                <p className="text-xs text-muted">{new Date(p.created_at).toLocaleString("es-CO")}</p>
              </div>
              <p className="mt-3 whitespace-pre-wrap text-sm text-foreground">{p.content}</p>
              {p.media_urls?.length ? (
                <ul className="mt-3 list-disc space-y-1 pl-5 text-xs text-muted">
                  {p.media_urls.map((u: string) => (
                    <li key={u} className="break-all">
                      {u}
                    </li>
                  ))}
                </ul>
              ) : null}

              <form action={decide} className="mt-4 grid gap-2 sm:grid-cols-2">
                <input type="hidden" name="publication_id" value={p.id} />
                <button className="glass-button" type="submit" name="decision" value="approved">
                  Aprobar
                </button>
                <button className="glass-button" type="submit" name="decision" value="rejected">
                  Rechazar
                </button>
              </form>
            </div>
          ))}
        </div>

        {safePending.length === 0 ? <p className="text-sm text-muted">No hay publicaciones pendientes.</p> : null}
      </section>
    </div>
  );
}

