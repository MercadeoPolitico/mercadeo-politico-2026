import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";

function allow(req: Request): boolean {
  // Prefer MP26_AUTOMATION_TOKEN (n8n contract), fallback to legacy AUTOMATION_API_TOKEN.
  const apiToken = process.env.MP26_AUTOMATION_TOKEN ?? process.env.AUTOMATION_API_TOKEN;
  const headerToken = req.headers.get("x-automation-token") ?? "";
  if (!apiToken) return false;
  // Defensive: tolerate accidental whitespace/newline in stored env or header.
  return headerToken.trim() === String(apiToken).trim();
}

export async function GET(req: Request) {
  // n8n-only (token protected). No session required.
  if (!allow(req)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const admin = createSupabaseAdminClient();
  if (!admin) return NextResponse.json({ error: "supabase_not_configured" }, { status: 503 });

  const { data, error } = await admin
    .from("politicians")
    .select("id,slug,name,office,party,region,ballot_number,auto_blog_enabled,auto_publish_enabled,biography,proposals,updated_at")
    // Only candidates eligible for automation (mandatory control surface).
    .eq("auto_blog_enabled", true)
    .order("updated_at", { ascending: false });

  if (error) return NextResponse.json({ error: "db_error" }, { status: 500 });

  return NextResponse.json({ ok: true, candidates: data ?? [] });
}

