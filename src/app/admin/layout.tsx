import type { Metadata } from "next";
import Link from "next/link";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { AdminAutoPublishToggleGate } from "./AdminAutoPublishToggleGate";

export const metadata: Metadata = {
  title: "Admin",
  robots: { index: false, follow: false },
};

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  // Best-effort role detection for navigation (no redirects here).
  let role: string | null = null;
  try {
    const supabase = await createSupabaseServerClient();
    if (supabase) {
      const { data } = await supabase.auth.getUser();
      const user = data.user;
      if (user) {
        const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).maybeSingle();
        role = typeof profile?.role === "string" ? profile.role : null;
      }
    }
  } catch {
    // ignore (nav remains minimal)
  }

  return (
    <div className="min-h-dvh">
      <header className="sticky top-0 z-40 border-b border-border bg-background/90 backdrop-blur">
        <div className="mx-auto flex w-full max-w-6xl items-center justify-between px-4 py-4">
          <Link href="/admin" className="font-semibold tracking-tight">
            Admin · mercadeo-politico-2026
          </Link>
          <div className="flex items-center gap-3">
            <AdminAutoPublishToggleGate />
            <nav className="flex items-center gap-1">
            <Link className="rounded-full px-3 py-2 text-sm font-medium text-muted hover:bg-surface hover:text-foreground" href="/admin">
              Dashboard
            </Link>
            {role === "super_admin" ? (
              <Link
                className="rounded-full px-3 py-2 text-sm font-medium text-muted hover:bg-surface hover:text-foreground"
                href="/admin/users"
              >
                Usuarios
              </Link>
            ) : null}
            <Link
              className="rounded-full px-3 py-2 text-sm font-medium text-muted hover:bg-surface hover:text-foreground"
              href="/admin/politicians"
            >
              Políticos
            </Link>
            <Link className="rounded-full px-3 py-2 text-sm font-medium text-muted hover:bg-surface hover:text-foreground" href="/admin/ai">
              Marleny AI
            </Link>
            <Link
              className="rounded-full px-3 py-2 text-sm font-medium text-muted hover:bg-surface hover:text-foreground"
              href="/admin/marleny-chat"
            >
              Chat SI
            </Link>
            <Link
              className="rounded-full px-3 py-2 text-sm font-medium text-muted hover:bg-surface hover:text-foreground"
              href="/admin/content"
            >
              Contenido
            </Link>
            <Link
              className="rounded-full px-3 py-2 text-sm font-medium text-muted hover:bg-surface hover:text-foreground"
              href="/admin/networks"
            >
              n8n / Redes
            </Link>
            </nav>
          </div>
        </div>
      </header>
      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-10">{children}</main>
    </div>
  );
}

