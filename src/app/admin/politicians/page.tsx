import { Section } from "@/components/Section";
import { requireAdmin } from "@/lib/auth/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { AdminPoliticiansClient } from "./ui";

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
        <AdminPoliticiansClient initial={politicians} />
      </Section>
    </div>
  );
}

