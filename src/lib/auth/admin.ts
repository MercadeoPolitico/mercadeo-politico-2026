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
  const role = user?.app_metadata?.role ?? user?.user_metadata?.role;

  if (!user || !isAdminRole(role)) redirect("/admin/login");

  return { user, role: role as AdminRole };
}

