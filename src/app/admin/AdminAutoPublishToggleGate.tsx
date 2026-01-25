"use client";

import { usePathname } from "next/navigation";
import { AdminAutoPublishToggle } from "./AdminAutoPublishToggle";

export function AdminAutoPublishToggleGate() {
  const pathname = usePathname() || "";
  const hide =
    pathname === "/admin/login" ||
    pathname.startsWith("/admin/login/") ||
    pathname === "/admin/force-password-change" ||
    pathname.startsWith("/admin/force-password-change/");
  if (hide) return null;
  return <AdminAutoPublishToggle />;
}

