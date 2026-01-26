import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth/admin";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";

export async function GET() {
  await requireAdmin();
  const admin = createSupabaseAdminClient();
  if (!admin) return NextResponse.json({ error: "not_configured" }, { status: 503 });

  const { data } = await admin
    .from("politicians")
    .select("id,slug,name,office,region,party,updated_at")
    .order("name", { ascending: true });

  return NextResponse.json({ ok: true, politicians: data ?? [] });
}

