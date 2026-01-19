import { requireSuperAdmin } from "@/lib/auth/admin";
import { AdminUsersClient } from "./ui";

export default async function AdminUsersPage() {
  await requireSuperAdmin();
  return <AdminUsersClient />;
}

