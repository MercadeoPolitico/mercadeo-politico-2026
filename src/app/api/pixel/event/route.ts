import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { readJsonBodyWithLimit } from "@/lib/automation/readBody";

export const runtime = "nodejs";

const EVENT_TYPES = new Set(["profile_view", "proposal_view", "social_click", "shared_link_visit"] as const);
type PixelEventType = (typeof EVENT_TYPES extends Set<infer T> ? T : never) & string;

type RefType = "direct" | "social" | "shared";

function isNonEmptyString(v: unknown): v is string {
  return typeof v === "string" && v.trim().length > 0;
}

function isRef(v: unknown): v is RefType {
  return v === "direct" || v === "social" || v === "shared";
}

export async function POST(req: Request) {
  const body = await readJsonBodyWithLimit(req);
  if (!body.ok) return NextResponse.json({ error: body.error }, { status: 400 });
  if (!body.data || typeof body.data !== "object") return NextResponse.json({ error: "invalid_body" }, { status: 400 });

  const b = body.data as Record<string, unknown>;

  const candidate_slug = isNonEmptyString(b.candidate_slug) ? b.candidate_slug.trim() : "";
  const event_type = isNonEmptyString(b.event_type) ? b.event_type.trim() : "";
  const source = b.source;
  const ref = b.ref;

  if (!candidate_slug) return NextResponse.json({ error: "candidate_slug_required" }, { status: 400 });
  if (!EVENT_TYPES.has(event_type as PixelEventType)) return NextResponse.json({ error: "invalid_event_type" }, { status: 400 });
  if (source !== "web") return NextResponse.json({ error: "invalid_source" }, { status: 400 });
  if (ref !== undefined && ref !== null && !isRef(ref)) return NextResponse.json({ error: "invalid_ref" }, { status: 400 });

  const admin = createSupabaseAdminClient();
  if (!admin) return NextResponse.json({ error: "not_configured" }, { status: 503 });

  const { data: pol } = await admin.from("politicians").select("id,slug").eq("slug", candidate_slug).maybeSingle();
  if (!pol) return NextResponse.json({ error: "not_found" }, { status: 404 });

  const now = new Date().toISOString();

  // No PII stored. No IP, no UA, no headers.
  await admin.from("analytics_events").insert({
    candidate_id: pol.id, // internal id (text) matching politicians.id
    event_type,
    municipality: null,
    content_id: null,
    occurred_at: now,
    source: "web",
    ref: ref ?? null,
  });

  return NextResponse.json({ ok: true });
}

