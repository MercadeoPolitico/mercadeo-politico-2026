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

async function requireSuperAdminSession() {
  const supabase = await createSupabaseServerClient();
  if (!supabase) return { ok: false as const, status: 503, error: "supabase_not_configured" };

  const { data: authData } = await supabase.auth.getUser();
  const user = authData.user;
  if (!user) return { ok: false as const, status: 401, error: "unauthorized" };

  const { data: me } = await supabase.from("profiles").select("role").eq("id", user.id).maybeSingle();
  if (me?.role !== "super_admin") return { ok: false as const, status: 403, error: "forbidden" };

  return { ok: true as const, supabase, user };
}

export async function GET() {
  const gate = await requireSuperAdminSession();
  if (!gate.ok) return NextResponse.json({ error: gate.error }, { status: gate.status });

  const admin = createSupabaseAdminClient();
  if (!admin) return NextResponse.json({ error: "admin_not_configured" }, { status: 503 });

  const { data: listed, error: listErr } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
  if (listErr || !listed?.users) return NextResponse.json({ error: "list_users_failed" }, { status: 500 });

  const ids = listed.users.map((u) => u.id);
  const { data: roles } = ids.length ? await admin.from("profiles").select("id,role").in("id", ids) : { data: [] as any[] };
  const roleMap = new Map<string, string>();
  (roles ?? []).forEach((r: any) => {
    if (r?.id && r?.role) roleMap.set(String(r.id), String(r.role));
  });

  const users = listed.users.map((u) => {
    const app = (u.app_metadata ?? {}) as Record<string, unknown>;
    return {
      id: u.id,
      email: u.email ?? null,
      created_at: (u.created_at as unknown) ?? null,
      last_sign_in_at: (u.last_sign_in_at as unknown) ?? null,
      role: roleMap.get(u.id) ?? null,
      must_change_password: app.must_change_password === true,
      disabled: app.disabled === true,
    };
  });

  return NextResponse.json({ ok: true, users });
}

export async function PATCH(req: Request) {
  const gate = await requireSuperAdminSession();
  if (!gate.ok) return NextResponse.json({ error: gate.error }, { status: gate.status });

  const body = await readJsonBodyWithLimit(req);
  if (!body.ok) return NextResponse.json({ error: body.error }, { status: 400 });
  if (!body.data || typeof body.data !== "object") return NextResponse.json({ error: "invalid_body" }, { status: 400 });

  const b = body.data as Record<string, unknown>;
  const user_id = typeof b.user_id === "string" ? b.user_id : "";
  const action = typeof b.action === "string" ? b.action : "";
  if (!user_id || !action) return NextResponse.json({ error: "missing_fields" }, { status: 400 });

  const admin = createSupabaseAdminClient();
  if (!admin) return NextResponse.json({ error: "admin_not_configured" }, { status: 503 });

  if (action === "reset_password") {
    const tempPassword = generateTempPassword();
    const nextAppMeta = { must_change_password: true };
    const { error } = await admin.auth.admin.updateUserById(user_id, { password: tempPassword, app_metadata: nextAppMeta });
    if (error) return NextResponse.json({ error: "reset_failed" }, { status: 500 });
    return NextResponse.json({ ok: true, tempPassword });
  }

  if (action === "set_disabled") {
    const disabled = b.disabled === true;
    const { data: userData, error: getErr } = await admin.auth.admin.getUserById(user_id);
    if (getErr || !userData?.user) return NextResponse.json({ error: "not_found" }, { status: 404 });
    const prev = (userData.user.app_metadata ?? {}) as Record<string, unknown>;
    const next = { ...prev, disabled };
    const { error } = await admin.auth.admin.updateUserById(user_id, { app_metadata: next });
    if (error) return NextResponse.json({ error: "update_failed" }, { status: 500 });
    return NextResponse.json({ ok: true });
  }

  if (action === "set_role") {
    const role = typeof b.role === "string" ? b.role : "";
    if (role !== "admin" && role !== "super_admin") return NextResponse.json({ error: "invalid_role" }, { status: 400 });
    // Ensure uniqueness of super_admin (defensive; DB also enforces)
    if (role === "super_admin") {
      const { data: supers } = await admin.from("profiles").select("id").eq("role", "super_admin");
      const other = (supers ?? []).find((r: any) => String(r.id) !== user_id);
      if (other) return NextResponse.json({ error: "super_admin_exists" }, { status: 409 });
    }
    const { error } = await admin.from("profiles").upsert({ id: user_id, role }, { onConflict: "id" });
    if (error) return NextResponse.json({ error: "update_failed" }, { status: 500 });
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: "unknown_action" }, { status: 400 });
}

export async function POST(req: Request) {
  const gate = await requireSuperAdminSession();
  if (!gate.ok) return NextResponse.json({ error: gate.error }, { status: gate.status });

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

