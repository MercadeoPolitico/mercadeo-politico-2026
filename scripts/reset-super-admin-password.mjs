/**
 * Reset SUPER ADMIN password (recovery script).
 *
 * Constraints:
 * - Do NOT hardcode credentials.
 * - Do NOT print secrets (passwords, service keys, reset links).
 * - Deterministic & production-safe:
 *   - It will only ensure the target user is THE single super_admin.
 *   - If another super_admin exists, it exits with failure.
 *
 * Usage (PowerShell):
 *   $env:NEXT_PUBLIC_SUPABASE_URL="..."
 *   $env:SUPABASE_SERVICE_ROLE_KEY="..."
 *   $env:RESET_SUPER_ADMIN_EMAIL="..."
 *   $env:RESET_SUPER_ADMIN_PASSWORD="..."  # temporary (you already know it)
 *   node scripts/reset-super-admin-password.mjs
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
  const email = env("RESET_SUPER_ADMIN_EMAIL").toLowerCase();
  const newPassword = env("RESET_SUPER_ADMIN_PASSWORD");

  const admin = createClient(url, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });

  // Find auth user by email.
  const { data: listed, error: listErr } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
  if (listErr || !listed?.users) throw new Error("Failed to list auth users.");
  const user = listed.users.find((u) => (u.email ?? "").toLowerCase() === email);
  if (!user) throw new Error("User not found.");

  // Ensure there is exactly one super_admin, and it is this user.
  const { data: existingSupers, error: supErr } = await admin.from("profiles").select("id,email,role").eq("role", "super_admin");
  if (supErr) throw new Error("Failed to query profiles.");

  const supers = existingSupers ?? [];
  if (supers.length > 1) throw new Error("Multiple super_admin profiles detected. Abort.");
  if (supers.length === 1 && supers[0]?.id !== user.id) throw new Error("Another super_admin already exists. Abort.");

  // Set (or keep) super_admin profile for this user.
  const { error: upsertProfileErr } = await admin.from("profiles").upsert(
    {
      id: user.id,
      email,
      role: "super_admin",
    },
    { onConflict: "id" }
  );
  if (upsertProfileErr) throw new Error("Failed to upsert super_admin profile.");

  // Reset password + force change on first login.
  const nextAppMetadata = { ...(user.app_metadata ?? {}), must_change_password: true };
  const { error: updErr } = await admin.auth.admin.updateUserById(user.id, {
    password: newPassword,
    app_metadata: nextAppMetadata,
  });
  if (updErr) throw new Error("Failed to update user password.");
}

main().catch(() => {
  // Intentionally no logging to avoid accidental secret leakage.
  process.exit(1);
});

