import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

export async function POST() {
  await requireAdmin();
  const supabase = await createSupabaseServerClient();
  if (!supabase) return NextResponse.json({ ok: false, error: "supabase_not_configured" }, { status: 503 });

  // Simple monotonic version: epoch ms as string.
  const version = String(Date.now());

  const { error } = await supabase.from("app_settings").upsert({ key: "cache_version", value: version, updated_at: new Date().toISOString() });
  if (error) return NextResponse.json({ ok: false, error: "db_error" }, { status: 500 });

  return NextResponse.json({ ok: true, version });
}

