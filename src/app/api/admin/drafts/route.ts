import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { readJsonBodyWithLimit } from "@/lib/automation/readBody";
import { isAdminSession } from "@/lib/auth/adminSession";

export const runtime = "nodejs";

type DraftStatus = "pending_review" | "approved" | "rejected" | "edited" | "sent_to_n8n";

export async function GET() {
  if (!(await isAdminSession())) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const supabase = await createSupabaseServerClient();
  if (!supabase) return NextResponse.json({ error: "supabase_not_configured" }, { status: 503 });

  const { data, error } = await supabase
    .from("ai_drafts")
    .select(
      "id,candidate_id,content_type,topic,tone,generated_text,variants,metadata,image_keywords,rotation_window_days,expires_at,source,status,reviewer_notes,created_at,updated_at",
    )
    .order("created_at", { ascending: false })
    .limit(50);

  if (error) return NextResponse.json({ error: "db_error" }, { status: 500 });
  return NextResponse.json({ ok: true, drafts: data ?? [] });
}

export async function POST(req: Request) {
  if (!(await isAdminSession())) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const supabase = await createSupabaseServerClient();
  if (!supabase) return NextResponse.json({ error: "supabase_not_configured" }, { status: 503 });

  const body = await readJsonBodyWithLimit(req);
  if (!body.ok) return NextResponse.json({ error: body.error }, { status: 400 });
  if (!body.data || typeof body.data !== "object") return NextResponse.json({ error: "invalid_body" }, { status: 400 });

  const b = body.data as Record<string, unknown>;

  const candidate_id = typeof b.candidate_id === "string" ? b.candidate_id.trim() : "";
  const content_type = typeof b.content_type === "string" ? b.content_type : "";
  const topic = typeof b.topic === "string" ? b.topic.trim() : "";
  const tone = typeof b.tone === "string" ? b.tone.trim() : null;
  const generated_text = typeof b.generated_text === "string" ? b.generated_text : "";

  const status = (typeof b.status === "string" ? b.status : "pending_review") as DraftStatus;
  const metadata = typeof b.metadata === "object" && b.metadata !== null ? b.metadata : {};
  const image_keywords = Array.isArray(b.image_keywords) ? (b.image_keywords.filter((x) => typeof x === "string") as string[]) : null;
  const rotation_window_days = typeof b.rotation_window_days === "number" ? b.rotation_window_days : null;
  const expires_at = typeof b.expires_at === "string" ? b.expires_at : null;
  const variants =
    typeof b.variants === "object" && b.variants !== null
      ? (b.variants as Record<string, unknown>)
      : b.variants === null
        ? null
        : null;

  if (!candidate_id || !content_type || !topic || !generated_text) {
    return NextResponse.json({ error: "missing_required_fields" }, { status: 400 });
  }

  const { data, error } = await supabase
    .from("ai_drafts")
    .insert({
      candidate_id,
      content_type,
      topic,
      tone,
      generated_text,
      variants: variants ?? {},
      metadata,
      image_keywords,
      rotation_window_days,
      expires_at,
      source: "web",
      status,
    })
    .select("id")
    .single();

  if (error) return NextResponse.json({ error: "db_error" }, { status: 500 });
  return NextResponse.json({ ok: true, id: data?.id });
}

export async function PATCH(req: Request) {
  if (!(await isAdminSession())) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const supabase = await createSupabaseServerClient();
  if (!supabase) return NextResponse.json({ error: "supabase_not_configured" }, { status: 503 });

  const body = await readJsonBodyWithLimit(req);
  if (!body.ok) return NextResponse.json({ error: body.error }, { status: 400 });
  if (!body.data || typeof body.data !== "object") return NextResponse.json({ error: "invalid_body" }, { status: 400 });

  const b = body.data as Record<string, unknown>;
  const id = typeof b.id === "string" ? b.id : "";
  if (!id) return NextResponse.json({ error: "id_required" }, { status: 400 });

  const patch: Record<string, unknown> = {};
  if (typeof b.generated_text === "string") patch.generated_text = b.generated_text;
  if (typeof b.status === "string") patch.status = b.status;
  if (typeof b.reviewer_notes === "string") patch.reviewer_notes = b.reviewer_notes;
  if (typeof b.metadata === "object" && b.metadata !== null) patch.metadata = b.metadata;
  if (typeof b.variants === "object" && b.variants !== null) patch.variants = b.variants;
  if (Array.isArray(b.image_keywords)) patch.image_keywords = b.image_keywords.filter((x) => typeof x === "string");
  if (typeof b.rotation_window_days === "number") patch.rotation_window_days = b.rotation_window_days;
  if (typeof b.expires_at === "string" || b.expires_at === null) patch.expires_at = b.expires_at;
  patch.updated_at = new Date().toISOString();

  const { error } = await supabase.from("ai_drafts").update(patch).eq("id", id);
  if (error) return NextResponse.json({ error: "db_error" }, { status: 500 });

  return NextResponse.json({ ok: true });
}

export async function DELETE(req: Request) {
  if (!(await isAdminSession())) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const supabase = await createSupabaseServerClient();
  if (!supabase) return NextResponse.json({ error: "supabase_not_configured" }, { status: 503 });

  const body = await readJsonBodyWithLimit(req);
  if (!body.ok) return NextResponse.json({ error: body.error }, { status: 400 });
  if (!body.data || typeof body.data !== "object") return NextResponse.json({ error: "invalid_body" }, { status: 400 });

  const b = body.data as Record<string, unknown>;
  const id = typeof b.id === "string" ? b.id.trim() : "";
  if (!id) return NextResponse.json({ error: "id_required" }, { status: 400 });

  const { error } = await supabase.from("ai_drafts").delete().eq("id", id);
  if (error) return NextResponse.json({ error: "db_error" }, { status: 500 });

  return NextResponse.json({ ok: true });
}

