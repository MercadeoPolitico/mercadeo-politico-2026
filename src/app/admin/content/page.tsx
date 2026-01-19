import { requireAdmin } from "@/lib/auth/admin";
import { Section } from "@/components/Section";
import { AdminContentPanel } from "./ui";

export default async function AdminContentPage() {
  await requireAdmin();
  return (
    <div className="space-y-10">
      <Section
        title="Contenido (borradores)"
        subtitle="Todo contenido generado se guarda como borrador pendiente de revisión. Nada se publica automáticamente."
      >
        <AdminContentPanel />
      </Section>
    </div>
  );
}

