import type { Metadata } from "next";
import Link from "next/link";
import Image from "next/image";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { AdminAutoPublishToggle } from "./AdminAutoPublishToggle";

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
    <div className="flex min-h-dvh flex-col">
      <header className="sticky top-0 z-40 border-b border-border bg-background/90 backdrop-blur">
        <div className="mx-auto flex w-full max-w-6xl items-center justify-between px-4 py-4">
          <Link href="/admin" className="font-semibold tracking-tight">
            Admin · mercadeo-politico-2026
          </Link>
          <div className="flex items-center gap-3">
            <AdminAutoPublishToggle />
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

      <footer className="border-t border-border bg-background/80 backdrop-blur">
        <div className="mx-auto flex w-full max-w-6xl flex-col gap-3 px-4 py-6 sm:flex-row sm:items-center sm:justify-between">
          <a
            className="inline-flex items-center gap-3 rounded-xl border border-border/60 bg-surface/50 px-3 py-2 text-xs text-muted hover:bg-surface"
            href="https://marketbrain.tech/landing"
            target="_blank"
            rel="noreferrer"
            aria-label="MarketBrain Technology (abrir en una nueva pestaña)"
          >
            <span className="relative inline-flex h-10 w-10 shrink-0 items-center justify-center">
              <span className="absolute inset-0 rounded-full bg-sky-300/25 blur-xl" />
              <span className="absolute inset-0 rounded-full bg-amber-300/20 blur-2xl" />
              <Image
                alt="MarketBrain Technology — sello"
                src="/icons/marketbrain-seal.png"
                width={40}
                height={40}
                className="relative h-10 w-10 rounded-full border border-white/18 bg-black/10 object-cover marketbrain-seal-glow"
                priority
              />
            </span>
            <span className="leading-snug">
              <span className="font-semibold text-foreground">Powered by MarketBrain Technology™</span>
              <span className="mx-2 text-muted">·</span>
              <span>Marleny Synthetic Intelligence</span>
            </span>
          </a>

          <p className="text-xs text-muted">© {new Date().getFullYear()} mercadeo-politico-2026</p>
        </div>
      </footer>
    </div>
  );
}

