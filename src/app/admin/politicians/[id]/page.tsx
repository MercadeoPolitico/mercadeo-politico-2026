import { notFound } from "next/navigation";
import { requireAdmin } from "@/lib/auth/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { PoliticianWorkspaceClient } from "./ui";

export const runtime = "nodejs";

export default async function PoliticianWorkspacePage({ params }: { params: Promise<{ id: string }> }) {
  await requireAdmin();
  const { id } = await params;
  const supabase = await createSupabaseServerClient();
  if (!supabase) notFound();

  const [{ data: politician }, { data: links }, { data: publications }] = await Promise.all([
    supabase.from("politicians").select("id,slug,name,office,party,region,biography,proposals,updated_at").eq("id", id).maybeSingle(),
    supabase
      .from("politician_social_links")
      .select("id,platform,handle,url,status,created_at")
      .eq("politician_id", id)
      .order("created_at", { ascending: true }),
    supabase
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

