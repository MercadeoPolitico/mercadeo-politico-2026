/**
 * POST /api/automation/ci-purge
 *
 * Deletes all citizen_news_posts (Centro Informativo). Protected by x-automation-token.
 * Use this to clear the feed so regenerated content (via editorial-orchestrate) uses the
 * current image pipeline. After purge, run the regenerate script or trigger orchestrate per politician.
 */
import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";

function normalizeToken(v: unknown): string {
  const s = String(v ?? "").trim();
  if (!s) return "";
  if ((s.startsWith('"') && s.endsWith('"')) || (s.startsWith("'") && s.endsWith("'"))) return s.slice(1, -1).trim();
  return s.endsWith("\\n") ? s.slice(0, -2).trim() : s;
}

function allow(req: Request): boolean {
  const apiToken = process.env.MP26_AUTOMATION_TOKEN ?? process.env.AUTOMATION_API_TOKEN;
  const headerToken = req.headers.get("x-automation-token") ?? "";
  if (!apiToken) return false;
  return normalizeToken(headerToken) === normalizeToken(apiToken);
}

export async function POST(req: Request) {
  if (!allow(req)) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  const admin = createSupabaseAdminClient();
  if (!admin) {
    return NextResponse.json({ ok: false, error: "supabase_not_configured" }, { status: 503 });
  }

  // Delete all rows (citizen_news_posts.id is uuid; use a condition that matches all).
  const { data: rows, error: selectError } = await admin
    .from("citizen_news_posts")
    .select("id")
    .limit(5000);

  if (selectError) {
    console.error("[ci-purge] select_error", { message: selectError.message });
    return NextResponse.json({ ok: false, error: "db_error" }, { status: 500 });
  }

  const ids = (rows ?? []).map((r) => r.id).filter(Boolean);
  if (ids.length === 0) {
    return NextResponse.json({ ok: true, deleted: 0 });
  }

  const { error: deleteError } = await admin.from("citizen_news_posts").delete().in("id", ids);

  if (deleteError) {
    console.error("[ci-purge] delete_error", { message: deleteError.message });
    return NextResponse.json({ ok: false, error: "db_error" }, { status: 500 });
  }

  return NextResponse.json({ ok: true, deleted: ids.length });
}
