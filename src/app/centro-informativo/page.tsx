import Link from "next/link";
import { Section } from "@/components/Section";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const metadata = {
  title: "Centro informativo ciudadano",
  description: "Noticias y análisis cívico por región y candidato. Enfoque en seguridad proactiva y propuestas verificables.",
};

type Post = {
  id: string;
  candidate_id: string;
  slug: string;
  title: string;
  excerpt: string;
  body: string;
  media_urls: string[] | null;
  source_url: string | null;
  published_at: string;
};

function normalizeLineBreaks(input: string): string {
  // Some AI engines may output HTML breaks. Centro Informativo stores/render as plain text.
  return String(input || "")
    .replace(/\r/g, "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export default async function CitizenInfoCenterPage() {
  const supabase = await createSupabaseServerClient();
  // Editorial policy:
  // Centro Informativo shows curated, approved civic publications (public-facing).
  // Drafts (`ai_drafts`) remain internal for editorial review in Admin → Contenido.
  const { data } = supabase
    ? await supabase
        .from("citizen_news_posts")
        .select("id,candidate_id,slug,title,excerpt,body,media_urls,source_url,published_at")
        .eq("status", "published")
        .order("published_at", { ascending: false })
        .limit(30)
    : { data: null };

  const posts = (data ?? []) as Post[];

  return (
    <div className="space-y-10">
      <Section
        title="Centro informativo ciudadano"
        subtitle="Actualidad y análisis cívico. Sin métricas, sin datos personales, sin desinformación."
      >
        {!supabase ? (
          <div className="glass-card p-6">
            <p className="text-sm text-muted">
              Este entorno no tiene Supabase configurado para cargar el feed. Verifica variables de entorno en el deployment.
            </p>
          </div>
        ) : null}

        <div className="grid gap-4">
          {posts.map((p) => (
            <article key={p.id} id={p.slug} className="glass-card p-6">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <h2 className="text-balance text-lg font-semibold">{p.title}</h2>
                  <p className="mt-1 text-xs text-muted">
                    {new Date(p.published_at).toLocaleString("es-CO")} ·{" "}
                    <span className="font-mono">{p.candidate_id}</span>
                  </p>
                </div>
                {p.source_url ? (
                  <a className="text-sm underline" href={p.source_url} target="_blank" rel="noreferrer">
                    Ver fuente
                  </a>
                ) : null}
              </div>

              {p.media_urls?.length ? (
                <figure className="mt-4 overflow-hidden rounded-2xl border border-border bg-background/40">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={p.media_urls[0]}
                    alt=""
                    className="max-h-[360px] w-full object-cover"
                    loading="lazy"
                    referrerPolicy="no-referrer"
                  />
                </figure>
              ) : null}

              {p.excerpt ? <p className="mt-3 whitespace-pre-wrap text-sm text-muted">{normalizeLineBreaks(p.excerpt)}</p> : null}

              <details className="mt-4 rounded-xl border border-border bg-background/50 p-4">
                <summary className="cursor-pointer text-sm font-semibold">Leer completo</summary>
                <div className="mt-3 space-y-3 text-sm text-muted">
                  {normalizeLineBreaks(p.body)
                    .split(/\n{2,}/g)
                    .map((s) => s.trim())
                    .filter(Boolean)
                    .map((para, idx) => (
                      <p key={idx} className="whitespace-pre-wrap">
                        {para}
                      </p>
                    ))}
                </div>
              </details>
            </article>
          ))}
          {posts.length === 0 ? (
            <div className="glass-card p-6">
              <p className="text-sm text-muted">Aún no hay publicaciones. Vuelve pronto.</p>
            </div>
          ) : null}
        </div>

        <div className="mt-6 flex flex-col gap-3 sm:flex-row">
          <Link className="glass-button" href="/candidates">
            Ver candidatos
          </Link>
          <Link className="glass-button" href="/">
            Volver al inicio
          </Link>
        </div>
      </Section>
    </div>
  );
}

