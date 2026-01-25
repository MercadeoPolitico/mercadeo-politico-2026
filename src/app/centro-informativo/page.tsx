import Link from "next/link";
import { Section } from "@/components/Section";
import { PublicPageShell } from "@/components/PublicPageShell";
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
  subtitle: string | null;
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

function isLikelyDocumentImageUrl(input: string): boolean {
  const s = String(input || "").toLowerCase();
  if (!s) return false;
  const bad = [
    ".pdf",
    "pdf.jpg",
    "pdf.png",
    "/page1-",
    "/page2-",
    "/page3-",
    "boletin",
    "boletín",
    "manual",
    "juridic",
    "jurídic",
    "resolucion",
    "resolución",
    "decreto",
    "acta",
    "oficio",
    "documento",
    "carta",
  ];
  return bad.some((b) => s.includes(b));
}

function splitPublicText(input: string): { main: string; meta: string[]; legal: string[] } {
  const raw = normalizeLineBreaks(input);
  if (!raw) return { main: "", meta: [], legal: [] };
  const meta: string[] = [];
  const legal: string[] = [];
  const main: string[] = [];

  for (const line of raw.split("\n")) {
    const t = String(line || "").trim();
    if (!t) {
      main.push("");
      continue;
    }
    const low = t.toLowerCase();
    if (low.startsWith("seo:") || low.startsWith("imagen:") || low.startsWith("crédito imagen:") || low.startsWith("credito imagen:") || low.startsWith("fuente imagen:")) {
      meta.push(t);
      continue;
    }
    if (
      low.includes("publicidad política") ||
      low.includes("publicidad politica") ||
      low.includes("contenido de carácter informativo") ||
      low.includes("contenido de caracter informativo") ||
      low.includes("no es responsable de las opiniones")
    ) {
      legal.push(t);
      continue;
    }
    main.push(t);
  }

  return {
    main: main.join("\n").replace(/\n{3,}/g, "\n\n").trim(),
    meta,
    legal,
  };
}

function renderInlineBold(text: string): Array<string | JSX.Element> {
  const t = String(text || "");
  if (!t.includes("**")) return [t];
  const out: Array<string | JSX.Element> = [];
  const re = /\*\*([^*]+)\*\*/g;
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(t))) {
    const start = m.index;
    const end = re.lastIndex;
    if (start > last) out.push(t.slice(last, start));
    const inner = String(m[1] ?? "").trim();
    if (inner) out.push(<strong key={`${start}-${end}`} className="text-foreground">{inner}</strong>);
    last = end;
  }
  if (last < t.length) out.push(t.slice(last));
  return out;
}

export default async function CitizenInfoCenterPage() {
  const supabase = await createSupabaseServerClient();
  // Editorial policy:
  // Centro Informativo shows curated, approved civic publications (public-facing).
  // Drafts (`ai_drafts`) remain internal for editorial review in Admin → Contenido.
  const { data } = supabase
    ? await supabase
        .from("citizen_news_posts")
        .select("id,candidate_id,slug,title,subtitle,excerpt,body,media_urls,source_url,published_at")
        .eq("status", "published")
        .order("published_at", { ascending: false })
        .limit(30)
    : { data: null };

  const posts = (data ?? []) as Post[];

  return (
    <PublicPageShell className="space-y-10">
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
              {(() => {
                const bodyParts = splitPublicText(p.body);
                const excerptParts = splitPublicText(p.excerpt);
                const mainText = bodyParts.main || excerptParts.main;
                const mediaUrl = p.media_urls?.[0] ? String(p.media_urls[0]) : "";
                const showMedia = Boolean(mediaUrl && !isLikelyDocumentImageUrl(mediaUrl));

                return (
                  <div className="grid gap-4 lg:grid-cols-[220px_1fr] lg:items-start">
                    {showMedia ? (
                      <figure className="overflow-hidden rounded-2xl border border-border bg-background/40">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={mediaUrl}
                          alt=""
                          className="h-[180px] w-full object-cover"
                          loading="lazy"
                          referrerPolicy="no-referrer"
                        />
                      </figure>
                    ) : (
                      <div className="hidden lg:block" />
                    )}

                    <div>
                      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                        <div>
                          <h2 className="text-balance text-lg font-semibold">{p.title}</h2>
                          {p.subtitle ? <p className="mt-1 text-xs text-muted">{p.subtitle}</p> : null}
                          <p className="mt-1 text-xs text-muted">{new Date(p.published_at).toLocaleString("es-CO")}</p>
                        </div>
                        {p.source_url ? (
                          <a className="text-sm underline" href={p.source_url} target="_blank" rel="noreferrer">
                            Ver fuente
                          </a>
                        ) : null}
                      </div>

                      {excerptParts.main ? (
                        <p className="mt-3 line-clamp-4 whitespace-pre-wrap text-sm text-muted">{renderInlineBold(excerptParts.main)}</p>
                      ) : null}

                      {mainText ? (
                        <details className="mt-4 rounded-xl border border-border bg-background/50 p-4">
                          <summary className="cursor-pointer text-sm font-semibold">Leer completo</summary>
                          <div className="mt-3 space-y-3 text-sm text-muted">
                            {mainText
                              .split(/\n{2,}/g)
                              .map((s) => s.trim())
                              .filter(Boolean)
                              .map((para, idx) => (
                                <p key={idx} className="whitespace-pre-wrap">
                                  {renderInlineBold(para)}
                                </p>
                              ))}
                          </div>

                          {bodyParts.legal.length ? (
                            <div className="mt-4 rounded-xl border border-white/10 bg-white/5 p-3 text-xs text-foreground/70">
                              <p className="font-semibold text-foreground/80">Nota legal</p>
                              <div className="mt-2 space-y-1">
                                {bodyParts.legal.map((l, i) => (
                                  <p key={i}>{l}</p>
                                ))}
                              </div>
                            </div>
                          ) : null}

                          {bodyParts.meta.length ? (
                            <div className="mt-3 text-xs text-foreground/60">
                              {bodyParts.meta.map((l, i) => (
                                <p key={i} className="break-words">
                                  {l}
                                </p>
                              ))}
                            </div>
                          ) : null}
                        </details>
                      ) : (
                        <div className="mt-4 rounded-xl border border-border bg-background/50 p-4">
                          <p className="text-sm text-muted">Contenido en revisión editorial. Vuelve pronto.</p>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })()}
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
    </PublicPageShell>
  );
}

