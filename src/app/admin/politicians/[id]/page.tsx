import { notFound } from "next/navigation";
import { requireAdmin } from "@/lib/auth/admin";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { PoliticianWorkspaceClient } from "./ui";
import { eduardBuitrago } from "@/content/candidates/eduard-buitrago";
import { joseAngelMartinez } from "@/content/candidates/jose-angel-martinez";

export const runtime = "nodejs";

export default async function PoliticianWorkspacePage({ params }: { params: Promise<{ id: string }> }) {
  await requireAdmin();
  const { id } = await params;
  const admin = createSupabaseAdminClient();
  if (!admin) notFound();

  const [{ data: politician }, { data: links }, { data: publications }] = await Promise.all([
    admin
      .from("politicians")
      .select("id,slug,name,office,party,region,ballot_number,auto_publish_enabled,auto_blog_enabled,biography,proposals,updated_at")
      .eq("id", id)
      .maybeSingle(),
    admin
      .from("politician_social_links")
      .select("id,platform,handle,url,status,created_at")
      .eq("politician_id", id)
      .order("created_at", { ascending: true }),
    admin
      .from("politician_publications")
      .select("id,platform,title,content,variants,media_urls,status,rotation_window_days,expires_at,created_at,updated_at,decided_at,decision_notes")
      .eq("politician_id", id)
      .order("created_at", { ascending: false })
      .limit(50),
  ]);

  if (!politician) notFound();

  // Ensure the admin sees the same content shown publicly when DB fields are still empty.
  // Admin edits remain the source of truth once saved (monodirectional).
  const fallbackById = new Map<string, any>([
    [eduardBuitrago.id, eduardBuitrago],
    [joseAngelMartinez.id, joseAngelMartinez],
  ]);
  const fb = fallbackById.get(String(politician.id)) ?? null;
  const hydrated = {
    ...politician,
    biography: String((politician as any).biography ?? "").trim() ? (politician as any).biography : (fb?.biography ?? ""),
    proposals: String((politician as any).proposals ?? "").trim() ? (politician as any).proposals : (fb?.proposal ?? ""),
    party: String((politician as any).party ?? "").trim() ? (politician as any).party : (fb?.party ?? null),
  };

  return (
    <PoliticianWorkspaceClient
      politician={hydrated as any}
      links={links ?? []}
      publications={publications ?? []}
    />
  );
}

