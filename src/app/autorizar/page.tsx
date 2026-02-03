import { Section } from "@/components/Section";
import { PublicPageShell } from "@/components/PublicPageShell";
import { AuthorizeClient } from "./ui";

export const metadata = {
  title: "Autorizar red",
  description: "Aprobar o rechazar autorización de publicación.",
};

function tokenFromParams(sp: { token?: string | string[] } | null): string {
  if (!sp || sp.token == null) return "";
  const t = sp.token;
  return typeof t === "string" ? t.trim() : Array.isArray(t) && t[0] ? String(t[0]).trim() : "";
}

export default async function AutorizarPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string | string[] }>;
}) {
  const sp = await searchParams;
  const token = tokenFromParams(sp);
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

