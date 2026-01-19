import "server-only";
import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export type AdminRole = "admin" | "super_admin";

export function isAdminRole(role: unknown): role is AdminRole {
  return role === "admin" || role === "super_admin";
}

export async function requireAdmin() {
  const supabase = await createSupabaseServerClient();
  if (!supabase) redirect("/admin/login");

  const { data } = await supabase.auth.getUser();
  const user = data.user;
  if (!user) redirect("/admin/login");

  // Source of truth: profiles table (RLS allows user to read only their own row)
  const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).maybeSingle();
  const role = profile?.role;

  if (!isAdminRole(role)) redirect("/admin/login");

  return { user, role: role as AdminRole, mustChangePassword: user.app_metadata?.must_change_password === true };
}

export async function requireSuperAdmin() {
  const { user, role, mustChangePassword } = await requireAdmin();
  if (role !== "super_admin") redirect("/admin");
  return { user, role, mustChangePassword };
}

