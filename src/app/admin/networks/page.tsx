import { requireAdmin } from "@/lib/auth/admin";
import { NetworksPanel } from "./ui";

export const metadata = {
  title: "Admin · n8n / Redes",
  robots: { index: false, follow: false },
};

export default async function AdminNetworksPage() {
  await requireAdmin();
  return <NetworksPanel />;
}

