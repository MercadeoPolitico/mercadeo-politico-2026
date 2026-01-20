import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Admin",
  robots: { index: false, follow: false },
};

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-dvh">
      <header className="border-b border-border bg-background">
        <div className="mx-auto flex w-full max-w-6xl items-center justify-between px-4 py-4">
          <Link href="/admin" className="font-semibold tracking-tight">
            Admin · mercadeo-politico-2026
          </Link>
          <nav className="flex items-center gap-1">
            <Link className="rounded-full px-3 py-2 text-sm font-medium text-muted hover:bg-surface hover:text-foreground" href="/admin">
              Dashboard
            </Link>
            <Link
              className="rounded-full px-3 py-2 text-sm font-medium text-muted hover:bg-surface hover:text-foreground"
              href="/admin/users"
            >
              Usuarios
            </Link>
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
          </nav>
        </div>
      </header>
      <main className="mx-auto w-full max-w-6xl px-4 py-10">{children}</main>
    </div>
  );
}

