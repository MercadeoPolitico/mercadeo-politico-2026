import { NextResponse } from "next/server";
import { randomBytes } from "node:crypto";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { readJsonBodyWithLimit } from "@/lib/automation/readBody";

export const runtime = "nodejs";

function isValidEmail(email: string): boolean {
  const v = email.trim().toLowerCase();
  // pragmatic validation (avoid over-restricting)
  return v.length >= 5 && v.includes("@") && v.includes(".");
}

function generateTempPassword(): string {
  // 24 chars base64url-like without padding; strong enough for temporary use.
  // NOTE: never log or print this value.
  const raw = randomBytes(18).toString("base64url");
  return `${raw}!A9`; // enforce complexity tail
}

export async function POST(req: Request) {
  const supabase = await createSupabaseServerClient();
  if (!supabase) return NextResponse.json({ error: "supabase_not_configured" }, { status: 503 });

  const { data: authData } = await supabase.auth.getUser();
  const user = authData.user;
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  // Authorize: only super_admin can create admins (source of truth: profiles)
  const { data: me } = await supabase.from("profiles").select("role").eq("id", user.id).maybeSingle();
  if (me?.role !== "super_admin") return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const body = await readJsonBodyWithLimit(req);
  if (!body.ok) return NextResponse.json({ error: body.error }, { status: 400 });
  if (!body.data || typeof body.data !== "object") return NextResponse.json({ error: "invalid_body" }, { status: 400 });

  const b = body.data as Record<string, unknown>;
  const email = typeof b.email === "string" ? b.email.trim().toLowerCase() : "";
  if (!email || !isValidEmail(email)) return NextResponse.json({ error: "invalid_email" }, { status: 400 });

  const admin = createSupabaseAdminClient();
  if (!admin) return NextResponse.json({ error: "admin_not_configured" }, { status: 503 });

  const tempPassword = generateTempPassword();

  const { data: created, error: createErr } = await admin.auth.admin.createUser({
    email,
    password: tempPassword,
    email_confirm: true,
    app_metadata: { must_change_password: true },
  });

  if (createErr || !created.user) return NextResponse.json({ error: "create_user_failed" }, { status: 500 });

  const { error: profileErr } = await admin.from("profiles").insert({
    id: created.user.id,
    email,
    role: "admin",
  });

  if (profileErr) return NextResponse.json({ error: "create_profile_failed" }, { status: 500 });

  return NextResponse.json({ ok: true, email, tempPassword });
}

