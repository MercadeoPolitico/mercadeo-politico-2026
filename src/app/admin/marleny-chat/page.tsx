import { requireAdmin } from "@/lib/auth/admin";
import { Section } from "@/components/Section";
import { MarlenyChatClient } from "./ui";

export default async function MarlenyChatPage() {
  await requireAdmin();
  return (
    <div className="space-y-10">
      <Section title="Marleny SI · Chat" subtitle="Chat interno para admins. No publica automáticamente.">
        <MarlenyChatClient />
      </Section>
    </div>
  );
}

