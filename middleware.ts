import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";

function env(name: string): string | null {
  const v = process.env[name];
  return v && v.trim().length ? v.trim() : null;
}

function isAdminRole(role: unknown): boolean {
  return role === "admin" || role === "super_admin";
}

export async function middleware(req: NextRequest) {
  const res = NextResponse.next();

  const url = env("NEXT_PUBLIC_SUPABASE_URL");
  const anon = env("NEXT_PUBLIC_SUPABASE_ANON_KEY");

  // If Supabase isn't configured, don't block the public site.
  if (!url || !anon) return res;

  const supabase = createServerClient(url, anon, {
    cookies: {
      getAll() {
        return req.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value, options }) => {
          res.cookies.set(name, value, options);
        });
      },
    },
  });

  const pathname = req.nextUrl.pathname;
  const isAdminArea = pathname === "/admin" || pathname.startsWith("/admin/");
  const isLogin = pathname === "/admin/login";

  if (!isAdminArea || isLogin) return res;

  // Server-side user verification (no client trust)
  const { data } = await supabase.auth.getUser();
  const user = data.user;

  const role = user?.app_metadata?.role ?? user?.user_metadata?.role;
  if (!user || !isAdminRole(role)) {
    const redirectUrl = req.nextUrl.clone();
    redirectUrl.pathname = "/admin/login";
    redirectUrl.searchParams.set("next", pathname);
    return NextResponse.redirect(redirectUrl);
  }

  return res;
}

export const config = {
  matcher: ["/admin/:path*"],
};

