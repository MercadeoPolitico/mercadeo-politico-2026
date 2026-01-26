import { notFound } from "next/navigation";
import { requireAdmin } from "@/lib/auth/admin";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { PoliticianWorkspaceClient } from "./ui";

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

  return (
    <PoliticianWorkspaceClient
      politician={politician}
      links={links ?? []}
      publications={publications ?? []}
    />
  );
}

