import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { isAdminSession } from "@/lib/auth/adminSession";
import { readJsonBodyWithLimit } from "@/lib/automation/readBody";
import { submitToN8n } from "@/lib/automation/n8n";
import type { SubmitToN8nRequest } from "@/lib/automation/types";

export const runtime = "nodejs";

export async function POST(req: Request) {
  if (!(await isAdminSession())) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const supabase = await createSupabaseServerClient();
  if (!supabase) return NextResponse.json({ error: "supabase_not_configured" }, { status: 503 });

  const body = await readJsonBodyWithLimit(req);
  if (!body.ok) return NextResponse.json({ error: body.error }, { status: 400 });
  if (!body.data || typeof body.data !== "object") return NextResponse.json({ error: "invalid_body" }, { status: 400 });

  const b = body.data as Record<string, unknown>;
  const publication_id = typeof b.publication_id === "string" ? b.publication_id : "";
  if (!publication_id) return NextResponse.json({ error: "publication_id_required" }, { status: 400 });

  const { data: pub, error: pubErr } = await supabase
    .from("politician_publications")
    .select("id,politician_id,platform,title,content,variants,media_urls,status,rotation_window_days,expires_at,created_at")
    .eq("id", publication_id)
    .maybeSingle();

  if (pubErr) return NextResponse.json({ error: "db_error" }, { status: 500 });
  if (!pub) return NextResponse.json({ error: "not_found" }, { status: 404 });

  if (pub.status !== "approved") return NextResponse.json({ error: "not_approved" }, { status: 400 });

  const now = new Date().toISOString();

  const payload: SubmitToN8nRequest = {
    candidate_id: pub.politician_id,
    content_type: "social",
    generated_text: pub.content,
    token_estimate: 0,
    created_at: now,
    source: "web",
    metadata: {
      origin: "admin_publication_send",
      publication_id: pub.id,
      platform: pub.platform,
      title: pub.title,
      variants: pub.variants ?? {},
      media_urls: pub.media_urls ?? [],
      rotation_window_days: pub.rotation_window_days ?? null,
      expires_at: pub.expires_at ?? null,
      publication_created_at: pub.created_at,
    },
  };

  const result = await submitToN8n(payload);
  if (!result.ok) {
    const status = result.error === "disabled" || result.error === "not_configured" ? 503 : 502;
    return NextResponse.json({ ok: false, error: result.error }, { status });
  }

  const { error: upErr } = await supabase
    .from("politician_publications")
    .update({ status: "sent_to_n8n", updated_at: now })
    .eq("id", pub.id);
  if (upErr) return NextResponse.json({ error: "db_error" }, { status: 500 });

  return NextResponse.json({ ok: true });
}

