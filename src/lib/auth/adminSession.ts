import "server-only";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { isAdminRole } from "./admin";

export async function isAdminSession(): Promise<boolean> {
  const supabase = await createSupabaseServerClient();
  if (!supabase) return false;
  const { data } = await supabase.auth.getUser();
  const user = data.user;
  const role = user?.app_metadata?.role ?? user?.user_metadata?.role;
  return Boolean(user && isAdminRole(role));
}

