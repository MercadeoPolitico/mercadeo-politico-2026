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

  // Politician mobile portal: minimal gate (cookie presence). Full validation is server-side.
  const pathname = req.nextUrl.pathname;
  const isPoliticoArea = pathname === "/politico" || pathname.startsWith("/politico/");
  const isPoliticoAccess = pathname === "/politico/access";

  if (isPoliticoArea && !isPoliticoAccess) {
    const hasCookie = Boolean(req.cookies.get("mp_politico")?.value);
    if (!hasCookie) {
      const redirectUrl = req.nextUrl.clone();
      redirectUrl.pathname = "/politico/access";
      return NextResponse.redirect(redirectUrl);
    }
  }

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

  const isAdminArea = pathname === "/admin" || pathname.startsWith("/admin/");
  const isLogin = pathname === "/admin/login";
  const isForcePassword = pathname === "/admin/force-password-change";

  if (!isAdminArea || isLogin) return res;

  // Server-side user verification (no client trust)
  const { data } = await supabase.auth.getUser();
  const user = data.user;

  if (!user) {
    const redirectUrl = req.nextUrl.clone();
    redirectUrl.pathname = "/admin/login";
    redirectUrl.searchParams.set("next", pathname);
    redirectUrl.searchParams.set("reason", "unauthorized");
    return NextResponse.redirect(redirectUrl);
  }

  // Source of truth: public.profiles (RLS: user can read only their own profile)
  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .maybeSingle();

  const role = profile?.role;
  if (!isAdminRole(role)) {
    const redirectUrl = req.nextUrl.clone();
    redirectUrl.pathname = "/admin/login";
    redirectUrl.searchParams.set("next", pathname);
    redirectUrl.searchParams.set("reason", "forbidden");
    return NextResponse.redirect(redirectUrl);
  }

  // Enforce password change on first login (admin-managed flag; user cannot tamper)
  const mustChangePassword = user.app_metadata?.must_change_password === true;
  if (mustChangePassword && !isForcePassword) {
    const redirectUrl = req.nextUrl.clone();
    redirectUrl.pathname = "/admin/force-password-change";
    redirectUrl.searchParams.set("reason", "must_change_password");
    return NextResponse.redirect(redirectUrl);
  }

  return res;
}

export const config = {
  matcher: ["/admin/:path*", "/politico/:path*"],
};

