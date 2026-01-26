import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth/admin";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";

export async function GET(req: Request) {
  await requireAdmin();
  const admin = createSupabaseAdminClient();
  if (!admin) return NextResponse.json({ error: "not_configured" }, { status: 503 });

  const { searchParams } = new URL(req.url);
  const candidate_id = (searchParams.get("candidate_id") ?? "").trim();
  if (!candidate_id) return NextResponse.json({ error: "candidate_id_required" }, { status: 400 });

  const { data, error } = await admin
    .from("ai_drafts")
    .select("id,candidate_id,content_type,generated_text,variants,created_at,status")
    .eq("candidate_id", candidate_id)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) return NextResponse.json({ error: "db_error" }, { status: 500 });
  return NextResponse.json({ ok: true, draft: data ?? null });
}

