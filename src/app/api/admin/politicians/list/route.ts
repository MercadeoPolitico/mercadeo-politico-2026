import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

export async function GET() {
  await requireAdmin();
  const supabase = await createSupabaseServerClient();
  if (!supabase) return NextResponse.json({ error: "not_configured" }, { status: 503 });

  const { data } = await supabase
    .from("politicians")
    .select("id,slug,name,office,region,party,updated_at")
    .order("name", { ascending: true });

  return NextResponse.json({ ok: true, politicians: data ?? [] });
}

