import Link from "next/link";
import { Section } from "@/components/Section";
import { requireAdmin } from "@/lib/auth/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export default async function AdminPoliticiansPage() {
  await requireAdmin();
  const supabase = await createSupabaseServerClient();

  const { data } = supabase
    ? await supabase.from("politicians").select("id,slug,name,office,region,party,updated_at").order("name", { ascending: true })
    : { data: null };

  const politicians = data ?? [];

  return (
    <div className="space-y-10">
      <Section
        title="Workspace · Políticos"
        subtitle="Administra biografía, propuestas, enlaces y publicaciones. El político aprueba desde un enlace exclusivo."
      >
        <div className="grid gap-4 md:grid-cols-2">
          {politicians.map((p) => (
            <Link key={p.id} href={`/admin/politicians/${p.id}`} className="glass-card p-6 transition hover:bg-white/10">
              <p className="text-sm font-semibold">{p.name}</p>
              <p className="mt-1 text-sm text-muted">{p.office}</p>
              <p className="mt-1 text-xs text-muted">
                {p.region}
                {p.party ? ` · ${p.party}` : ""}
              </p>
              <p className="mt-3 text-xs text-muted">Última actualización: {new Date(p.updated_at).toLocaleString("es-CO")}</p>
            </Link>
          ))}
        </div>
        {politicians.length === 0 ? <p className="text-sm text-muted">No hay políticos cargados aún.</p> : null}
      </Section>
    </div>
  );
}

