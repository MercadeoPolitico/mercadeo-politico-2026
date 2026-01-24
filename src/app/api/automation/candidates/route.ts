import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";

function isBrowserOrigin(req: Request): boolean {
  // Use conservative signals that don't appear in Node/n8n fetch.
  return Boolean(
    req.headers.get("sec-fetch-site") ||
      req.headers.get("sec-ch-ua") ||
      req.headers.get("sec-ch-ua-mobile") ||
      req.headers.get("sec-ch-ua-platform"),
  );
}

function normalizeToken(v: unknown): string {
  const s = String(v ?? "").trim();
  if (!s) return "";
  if ((s.startsWith('"') && s.endsWith('"')) || (s.startsWith("'") && s.endsWith("'"))) return s.slice(1, -1).trim();
  // Fix accidental trailing literal \n in copied secrets (common).
  return s.endsWith("\\n") ? s.slice(0, -2).trim() : s;
}

function allow(req: Request): boolean {
  // Prefer MP26_AUTOMATION_TOKEN (n8n contract), fallback to legacy AUTOMATION_API_TOKEN.
  const apiToken = process.env.MP26_AUTOMATION_TOKEN ?? process.env.AUTOMATION_API_TOKEN;
  const headerToken = req.headers.get("x-automation-token") ?? "";
  if (!apiToken) return false;
  // Defensive: tolerate whitespace/newlines and accidental quotes in env/header.
  return normalizeToken(headerToken) === normalizeToken(apiToken);
}

export async function GET(req: Request) {
  // n8n-only (token protected). No session required.
  if (!allow(req)) {
    if (isBrowserOrigin(req)) {
      console.warn("[automation/candidates] rejected_browser_origin", { path: "/api/automation/candidates" });
      return NextResponse.json({ error: "forbidden" }, { status: 403 });
    }
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

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

