import Link from "next/link";
import { Section } from "@/components/Section";
import { getBlogPosts } from "@/lib/blog/getBlogPosts";

export const metadata = {
  title: "Blog",
  description:
    "Contenido político y educación cívica para Meta, Colombia. Publicación responsable y transparente.",
};

export default function BlogPage() {
  const posts = getBlogPosts();
  return (
    <div className="space-y-10">
      <Section title="Blog" subtitle="Contenido público (SEO) con enfoque cívico y transparencia.">
        <div className="rounded-2xl border border-border bg-surface p-6">
          {posts.length === 0 ? (
            <p className="text-sm text-muted">
              Próximamente: publicaciones, categorías, etiquetas y autores. La base está lista para integrarse con
              Supabase (contenido administrable y escalable).
            </p>
          ) : (
            <ul className="space-y-3">
              {posts.map((p) => (
                <li key={p.id} className="rounded-xl border border-border bg-background p-4">
                  <p className="text-sm font-semibold">{p.title}</p>
                  {p.excerpt && <p className="mt-1 text-sm text-muted">{p.excerpt}</p>}
                </li>
              ))}
            </ul>
          )}
          <div className="mt-4 flex flex-col gap-3 sm:flex-row">
            <Link
              className="inline-flex items-center justify-center rounded-full border border-border px-5 py-3 text-sm font-semibold transition-colors hover:bg-surface"
              href="/about"
            >
              Ver principios editoriales
            </Link>
            <Link
              className="inline-flex items-center justify-center rounded-full bg-foreground px-5 py-3 text-sm font-semibold text-background transition-colors hover:opacity-90"
              href="/"
            >
              Volver al inicio
            </Link>
          </div>
        </div>
      </Section>
    </div>
  );
}

