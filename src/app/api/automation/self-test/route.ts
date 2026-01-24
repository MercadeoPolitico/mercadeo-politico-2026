import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";

function allow(req: Request): boolean {
  const apiToken = process.env.MP26_AUTOMATION_TOKEN ?? process.env.AUTOMATION_API_TOKEN;
  const headerToken = req.headers.get("x-automation-token") ?? "";
  if (!apiToken) return false;
  // Defensive: tolerate accidental whitespace/newline in stored env or header.
  return headerToken.trim() === String(apiToken).trim();
}

function logSupabaseError(args: { requestId: string; step: string; error: any }) {
  const e = args.error as { message?: unknown; code?: unknown; details?: unknown; hint?: unknown };
  console.error("[automation-self-test] supabase_error", {
    requestId: args.requestId,
    step: args.step,
    message: typeof e?.message === "string" ? e.message : null,
    code: typeof e?.code === "string" ? e.code : null,
    details: typeof e?.details === "string" ? e.details : null,
    hint: typeof e?.hint === "string" ? e.hint : null,
  });
}

export async function GET(req: Request) {
  if (!allow(req)) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });

  const requestId = (() => {
    try {
      return crypto.randomUUID();
    } catch {
      return `req_${Date.now()}`;
    }
  })();

  const admin = createSupabaseAdminClient();
  if (!admin) return NextResponse.json({ ok: false, error: "supabase_not_configured", request_id: requestId }, { status: 503 });

  const url = new URL(req.url);
  const candidate_id = (url.searchParams.get("candidate_id") ?? "").trim();

  let candidateIdToUse = candidate_id;
  if (!candidateIdToUse) {
    const { data: anyPol, error } = await admin.from("politicians").select("id").order("updated_at", { ascending: false }).limit(1).maybeSingle();
    if (error) {
      logSupabaseError({ requestId, step: "pick_candidate", error });
      return NextResponse.json({ ok: false, error: "pick_candidate_failed", request_id: requestId }, { status: 500 });
    }
    if (!anyPol?.id) return NextResponse.json({ ok: false, error: "no_candidates_found", request_id: requestId }, { status: 400 });
    candidateIdToUse = String(anyPol.id);
  }

  const { data: pol, error: polErr } = await admin
    .from("politicians")
    .select("id,slug,name")
    .eq("id", candidateIdToUse)
    .maybeSingle();
  if (polErr) {
    logSupabaseError({ requestId, step: "validate_candidate", error: polErr });
    return NextResponse.json({ ok: false, error: "candidate_lookup_failed", request_id: requestId }, { status: 500 });
  }
  if (!pol) return NextResponse.json({ ok: false, error: "candidate_not_found", request_id: requestId }, { status: 400 });

  const { data: inserted, error: insErr } = await admin
    .from("ai_drafts")
    .insert({
      candidate_id: pol.id,
      content_type: "blog",
      topic: "TEST DRAFT – DELETE",
      tone: "test",
      generated_text: "TEST DRAFT – DELETE\n\nCreated by GET /api/automation/self-test.",
      variants: {},
      metadata: { test: true, request_id: requestId },
      image_keywords: null,
      source: "n8n",
      status: "draft",
    })
    .select("id")
    .single();

  if (insErr || !inserted?.id) {
    if (insErr) logSupabaseError({ requestId, step: "insert_ai_draft", error: insErr });
    return NextResponse.json({ ok: false, error: "insert_failed", request_id: requestId }, { status: 500 });
  }

  const { count, error: countErr } = await admin.from("ai_drafts").select("*", { count: "exact", head: true });
  if (countErr) {
    logSupabaseError({ requestId, step: "count_ai_drafts", error: countErr });
    return NextResponse.json({ ok: false, error: "count_failed", request_id: requestId, inserted_id: inserted.id }, { status: 500 });
  }

  const { data: verifyRow, error: verifyErr } = await admin.from("ai_drafts").select("id").eq("id", inserted.id).maybeSingle();
  if (verifyErr) {
    logSupabaseError({ requestId, step: "verify_ai_draft", error: verifyErr });
    return NextResponse.json({ ok: false, error: "verify_failed", request_id: requestId, inserted_id: inserted.id }, { status: 500 });
  }
  if (!verifyRow?.id) {
    console.error("[automation-self-test] assertion_failed_no_row_after_insert", { requestId, inserted_id: inserted.id });
    return NextResponse.json({ ok: false, error: "assertion_failed", request_id: requestId, inserted_id: inserted.id }, { status: 500 });
  }

  return NextResponse.json({
    ok: true,
    request_id: requestId,
    inserted_id: inserted.id,
    total_drafts_count: count ?? null,
  });
}

