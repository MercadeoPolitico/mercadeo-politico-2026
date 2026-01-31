import "server-only";

import { createSupabaseServerClient } from "@/lib/supabase/server";
import { isAdminRole, type AdminRole } from "./admin";

export type AdminApiAuth =
  | { ok: true; role: AdminRole; user_id: string }
  | { ok: false; status: 401 | 403 | 503; error: "unauthorized" | "forbidden" | "not_configured" };

/**
 * Admin auth for API routes (JSON-friendly).
 *
 * - Mirrors `requireAdmin()` logic without redirects.
 * - Does NOT use service role; still uses the caller's Supabase session.
 * - Safe: returns only coarse auth state.
 */
export async function requireAdminApi(): Promise<AdminApiAuth> {
  const supabase = await createSupabaseServerClient();
  if (!supabase) return { ok: false, status: 503, error: "not_configured" };

  const { data } = await supabase.auth.getUser();
  const user = data.user;
  if (!user) return { ok: false, status: 401, error: "unauthorized" };
  if (user.app_metadata?.disabled === true) return { ok: false, status: 403, error: "forbidden" };

  const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).maybeSingle();
  if (!profile || !isAdminRole(profile.role)) return { ok: false, status: 403, error: "forbidden" };

  return { ok: true, role: profile.role as AdminRole, user_id: user.id };
}

