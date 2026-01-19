import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { isAdminSession } from "@/lib/auth/adminSession";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";

export async function POST() {
  if (!(await isAdminSession())) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const supabase = await createSupabaseServerClient();
  if (!supabase) return NextResponse.json({ error: "supabase_not_configured" }, { status: 503 });

  const { data } = await supabase.auth.getUser();
  const user = data.user;
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const admin = createSupabaseAdminClient();
  if (!admin) return NextResponse.json({ error: "admin_not_configured" }, { status: 503 });

  const nextAppMeta = { ...(user.app_metadata ?? {}), must_change_password: false };

  const { error } = await admin.auth.admin.updateUserById(user.id, { app_metadata: nextAppMeta });
  if (error) return NextResponse.json({ error: "auth_update_failed" }, { status: 500 });

  return NextResponse.json({ ok: true });
}

