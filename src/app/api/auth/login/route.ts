import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { readJsonBodyWithLimit } from "@/lib/automation/readBody";

export const runtime = "nodejs";

function classifyAuthError(err: unknown): "invalid_api_key" | "email_not_confirmed" | "invalid_credentials" | "rate_limited" | "unknown" {
  const msg = typeof (err as any)?.message === "string" ? String((err as any).message) : "";
  const status = typeof (err as any)?.status === "number" ? Number((err as any).status) : undefined;

  const m = msg.toLowerCase();
  if (m.includes("invalid api key") || m.includes("invalid jwt") || m.includes("apikey")) return "invalid_api_key";
  if (m.includes("email not confirmed")) return "email_not_confirmed";
  if (status === 429 || m.includes("rate limit")) return "rate_limited";
  if (m.includes("invalid login credentials")) return "invalid_credentials";
  return "unknown";
}

export async function POST(req: Request) {
  const supabase = await createSupabaseServerClient();
  if (!supabase) return NextResponse.json({ error: "supabase_not_configured" }, { status: 503 });

  const body = await readJsonBodyWithLimit(req);
  if (!body.ok) return NextResponse.json({ error: body.error }, { status: 400 });
  if (!body.data || typeof body.data !== "object") return NextResponse.json({ error: "invalid_body" }, { status: 400 });

  const b = body.data as Record<string, unknown>;
  const email = typeof b.email === "string" ? b.email.trim().toLowerCase() : "";
  const password = typeof b.password === "string" ? b.password : "";
  if (!email || !password) return NextResponse.json({ error: "email_and_password_required" }, { status: 400 });

  // IMPORTANT:
  // This server route performs sign-in so @supabase/ssr can set auth cookies.
  // That makes middleware + server components able to read the session.
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error || !data.user) {
    const reason = classifyAuthError(error);
    // Safe: does not include secrets. Avoids echoing the email back.
    return NextResponse.json(
      {
        error: "auth_failed",
        reason,
      },
      { status: 401 }
    );
  }

  return NextResponse.json({
    ok: true,
    mustChangePassword: data.user.app_metadata?.must_change_password === true,
  });
}

