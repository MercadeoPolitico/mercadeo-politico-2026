import { requireAdmin } from "@/lib/auth/admin";
import { Section } from "@/components/Section";
import { AdminAiPanel } from "./ui";

export default async function AdminAiPage() {
  await requireAdmin();
  return (
    <div className="space-y-10">
      <Section
        title="Marleny AI (interno)"
        subtitle="Generación bajo control: una solicitud = una llamada. Nada se publica automáticamente."
      >
        <AdminAiPanel />
      </Section>
    </div>
  );
}

