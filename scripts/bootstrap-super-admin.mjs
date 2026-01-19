/**
 * One-time bootstrap: create the initial SUPER ADMIN user and profile.
 *
 * Constraints:
 * - Do NOT hardcode credentials.
 * - Do NOT print secrets (passwords, service keys).
 * - Deterministic & production-safe: script exits if a super_admin already exists.
 *
 * Usage (PowerShell):
 *   $env:NEXT_PUBLIC_SUPABASE_URL="..."
 *   $env:SUPABASE_SERVICE_ROLE_KEY="..."
 *   $env:BOOTSTRAP_SUPER_ADMIN_EMAIL="..."
 *   $env:BOOTSTRAP_SUPER_ADMIN_PASSWORD="..."  # temporary (strong)
 *   node scripts/bootstrap-super-admin.mjs
 */

import { createClient } from "@supabase/supabase-js";

function env(name) {
  const v = process.env[name];
  if (!v || !String(v).trim()) throw new Error(`Missing env: ${name}`);
  return String(v).trim();
}

async function main() {
  const url = env("NEXT_PUBLIC_SUPABASE_URL");
  const serviceRoleKey = env("SUPABASE_SERVICE_ROLE_KEY");
  const email = env("BOOTSTRAP_SUPER_ADMIN_EMAIL").toLowerCase();
  const password = env("BOOTSTRAP_SUPER_ADMIN_PASSWORD");

  const admin = createClient(url, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });

  const { count, error: countErr } = await admin
    .from("profiles")
    .select("*", { count: "exact", head: true })
    .eq("role", "super_admin");
  if (countErr) throw new Error("Failed to query profiles.");
  if ((count ?? 0) > 0) return;

  const { data: created, error: createErr } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    app_metadata: { must_change_password: true },
  });
  if (createErr || !created.user) throw new Error("Failed to create super_admin user.");

  const { error: profileErr } = await admin.from("profiles").insert({
    id: created.user.id,
    email,
    role: "super_admin",
  });
  if (profileErr) throw new Error("Failed to create super_admin profile.");
}

main().catch(() => {
  // Intentionally no logging to avoid accidental secret leakage.
  process.exit(1);
});

