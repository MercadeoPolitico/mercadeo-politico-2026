import { NextResponse } from "next/server";
import crypto from "node:crypto";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { readJsonBodyWithLimit } from "@/lib/automation/readBody";

export const runtime = "nodejs";

function normalizeToken(v: unknown): string {
  const s = String(v ?? "").trim();
  if (!s) return "";
  if ((s.startsWith('"') && s.endsWith('"')) || (s.startsWith("'") && s.endsWith("'"))) return s.slice(1, -1).trim();
  return s.endsWith("\\n") ? s.slice(0, -2).trim() : s;
}

function sha256Hex(input: string): string {
  return crypto.createHash("sha256").update(input).digest("hex");
}

function isExpired(expiresAt: string): boolean {
  const t = Date.parse(expiresAt);
  if (!Number.isFinite(t)) return false;
  return t <= Date.now();
}

export async function GET(req: Request) {
  const token = normalizeToken(new URL(req.url).searchParams.get("token"));
  if (!token) return NextResponse.json({ ok: false, error: "token_required" }, { status: 400 });

  const admin = createSupabaseAdminClient();
  if (!admin) return NextResponse.json({ ok: false, error: "not_configured" }, { status: 503 });

  const token_hash = sha256Hex(token);
  const { data: invite } = await admin
    .from("politician_social_auth_invites")
    .select("id,destination_id,expires_at,used_at,decision,created_at")
    .eq("token_hash", token_hash)
    .maybeSingle();
  if (!invite) return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });
  if (invite.used_at) return NextResponse.json({ ok: false, error: "already_used" }, { status: 409 });
  if (isExpired(invite.expires_at)) return NextResponse.json({ ok: false, error: "expired" }, { status: 410 });

  const { data: dest } = await admin
    .from("politician_social_destinations")
    .select("id,politician_id,network_name,network_type,profile_or_page_url,owner_name,authorization_status,active")
    .eq("id", invite.destination_id)
    .maybeSingle();
  if (!dest) return NextResponse.json({ ok: false, error: "destination_not_found" }, { status: 404 });

  const { data: pol } = await admin.from("politicians").select("id,name,office,region,ballot_number").eq("id", dest.politician_id).maybeSingle();

  return NextResponse.json({
    ok: true,
    invite: { expires_at: invite.expires_at },
    destination: {
      id: dest.id,
      network_name: dest.network_name,
      network_type: dest.network_type,
      profile_or_page_url: dest.profile_or_page_url,
    },
    candidate: pol
      ? { id: pol.id, name: pol.name, office: pol.office, region: pol.region, ballot_number: pol.ballot_number ?? null }
      : { id: dest.politician_id, name: dest.politician_id, office: "", region: "", ballot_number: null },
  });
}

export async function POST(req: Request) {
  const admin = createSupabaseAdminClient();
  if (!admin) return NextResponse.json({ ok: false, error: "not_configured" }, { status: 503 });

  const body = await readJsonBodyWithLimit(req);
  if (!body.ok) return NextResponse.json({ ok: false, error: body.error }, { status: 400 });
  if (!body.data || typeof body.data !== "object") return NextResponse.json({ ok: false, error: "invalid_body" }, { status: 400 });

  const b = body.data as Record<string, unknown>;
  const token = normalizeToken(b.token);
  const decision = normalizeToken(b.decision);
  const authorized_by_name = normalizeToken(b.authorized_by_name);
  const authorized_by_email = normalizeToken(b.authorized_by_email);
  const authorized_by_phone = normalizeToken(b.authorized_by_phone);
  if (!token) return NextResponse.json({ ok: false, error: "token_required" }, { status: 400 });
  if (decision !== "approve" && decision !== "reject") return NextResponse.json({ ok: false, error: "decision_invalid" }, { status: 400 });

  const token_hash = sha256Hex(token);
  const { data: invite } = await admin
    .from("politician_social_auth_invites")
    .select("id,destination_id,expires_at,used_at,decision")
    .eq("token_hash", token_hash)
    .maybeSingle();

  if (!invite) return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });
  if (invite.used_at) return NextResponse.json({ ok: false, error: "already_used" }, { status: 409 });
  if (isExpired(invite.expires_at)) return NextResponse.json({ ok: false, error: "expired" }, { status: 410 });

  const now = new Date().toISOString();
  const mapped = decision === "approve" ? "approved" : "rejected";

  const ip =
    normalizeToken(req.headers.get("x-forwarded-for") ?? "").split(",")[0]?.trim() ||
    normalizeToken(req.headers.get("x-real-ip") ?? "").trim() ||
    "";
  const ua = normalizeToken(req.headers.get("user-agent") ?? "");

  const { error: invErr } = await admin
    .from("politician_social_auth_invites")
    .update({
      used_at: now,
      decision: mapped,
      authorized_by_name: authorized_by_name || null,
      authorized_by_email: authorized_by_email || null,
      authorized_by_phone: authorized_by_phone || null,
      authorized_ip: ip || null,
      authorized_user_agent: ua || null,
    })
    .eq("id", invite.id);
  if (invErr) return NextResponse.json({ ok: false, error: "update_failed" }, { status: 500 });

  if (decision === "approve") {
    await admin
      .from("politician_social_destinations")
      .update({
        authorization_status: "approved",
        active: true,
        authorized_at: now,
        authorized_by_name: authorized_by_name || null,
        authorized_by_email: authorized_by_email || null,
        authorized_by_phone: authorized_by_phone || null,
        updated_at: now,
      })
      .eq("id", invite.destination_id);
  } else {
    await admin
      .from("politician_social_destinations")
      .update({ authorization_status: "revoked", active: false, revoked_at: now, updated_at: now })
      .eq("id", invite.destination_id);
  }

  return NextResponse.json({ ok: true, status: decision === "approve" ? "approved" : "revoked" });
}

