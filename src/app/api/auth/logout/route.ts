import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

export async function POST() {
  const supabase = await createSupabaseServerClient();
  if (!supabase) return NextResponse.json({ ok: true });

  // Server-side sign-out clears auth cookies (SSR client).
  await supabase.auth.signOut();
  return NextResponse.json({ ok: true });
}

