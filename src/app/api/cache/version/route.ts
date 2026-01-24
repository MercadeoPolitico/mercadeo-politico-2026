import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

export async function GET() {
  const supabase = await createSupabaseServerClient();
  if (!supabase) return NextResponse.json({ ok: true, version: "0" });

  const { data } = await supabase.from("app_settings").select("value").eq("key", "cache_version").maybeSingle();
  const version = typeof data?.value === "string" && data.value.trim().length ? data.value.trim() : "0";

  return NextResponse.json({ ok: true, version });
}

