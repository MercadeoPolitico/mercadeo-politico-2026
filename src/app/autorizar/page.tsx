import { Section } from "@/components/Section";
import { PublicPageShell } from "@/components/PublicPageShell";
import { AuthorizeClient } from "./ui";

export const metadata = {
  title: "Autorizar red",
  description: "Aprobar o rechazar autorización de publicación.",
};

export default function AutorizarPage({ searchParams }: { searchParams: { token?: string } }) {
  const token = typeof searchParams?.token === "string" ? searchParams.token : "";
  return (
    <PublicPageShell className="space-y-10">
      <Section
        title="Autorización de publicación"
        subtitle="Solo tú (dueño de la red) puedes aprobar o rechazar. El enlace expira automáticamente."
      >
        <AuthorizeClient token={token} />
      </Section>
    </PublicPageShell>
  );
}

