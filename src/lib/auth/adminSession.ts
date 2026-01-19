import "server-only";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { isAdminRole } from "./admin";

export async function isAdminSession(): Promise<boolean> {
  const supabase = await createSupabaseServerClient();
  if (!supabase) return false;
  const { data } = await supabase.auth.getUser();
  const user = data.user;
  if (!user) return false;

  const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).maybeSingle();
  return Boolean(profile && isAdminRole(profile.role));
}

