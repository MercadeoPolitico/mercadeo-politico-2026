import { NextResponse } from "next/server";
import crypto from "node:crypto";
import { requireAdmin } from "@/lib/auth/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { readJsonBodyWithLimit } from "@/lib/automation/readBody";
import { getSiteUrlString } from "@/lib/site";

export const runtime = "nodejs";

function isNonEmptyString(v: unknown): v is string {
  return typeof v === "string" && v.trim().length > 0;
}

function sha256Hex(input: string): string {
  return crypto.createHash("sha256").update(input).digest("hex");
}

function normalizePhone(raw: string): string {
  // WhatsApp wa.me expects digits only, including country code.
  let digits = raw.replaceAll(/[^\d]+/g, "");
  if (!digits) return "";
  if (digits.startsWith("00")) digits = digits.slice(2);
  // Colombia common: 10 digits local mobile -> prefix 57
  if (digits.length === 10) digits = `57${digits}`;
  return digits;
}

function waMeLink(phoneDigits: string, message: string): string {
  const p = encodeURIComponent(phoneDigits);
  const t = encodeURIComponent(message);
  return `https://wa.me/${p}?text=${t}`;
}

export async function POST(req: Request) {
  await requireAdmin();
  const supabase = await createSupabaseServerClient();
  if (!supabase) return NextResponse.json({ error: "not_configured" }, { status: 503 });

  const body = await readJsonBodyWithLimit(req);
  if (!body.ok) return NextResponse.json({ error: body.error }, { status: 400 });
  if (!body.data || typeof body.data !== "object") return NextResponse.json({ error: "invalid_body" }, { status: 400 });

  const b = body.data as Record<string, unknown>;
  const destination_id = isNonEmptyString(b.destination_id) ? b.destination_id.trim() : "";
  if (!destination_id) return NextResponse.json({ error: "destination_id_required" }, { status: 400 });

  const { data: dest } = await supabase
    .from("politician_social_destinations")
    .select("id,politician_id,network_name,profile_or_page_url,owner_name,owner_contact_phone,authorization_status,active")
    .eq("id", destination_id)
    .maybeSingle();
  if (!dest) return NextResponse.json({ error: "not_found" }, { status: 404 });

  const { data: pol } = await supabase.from("politicians").select("id,name,office,region,ballot_number").eq("id", dest.politician_id).maybeSingle();
  if (!pol) return NextResponse.json({ error: "candidate_not_found" }, { status: 404 });

  const rawPhone = typeof dest.owner_contact_phone === "string" ? dest.owner_contact_phone : "";
  const phone = normalizePhone(rawPhone);
  if (!phone) return NextResponse.json({ error: "owner_contact_phone_required" }, { status: 400 });

  const token = crypto.randomBytes(24).toString("hex"); // 48 chars
  const token_hash = sha256Hex(token);
  const now = Date.now();
  const expires_at = new Date(now + 5 * 60 * 60 * 1000).toISOString(); // 5h

  const invite_url = `${getSiteUrlString()}/autorizar?token=${encodeURIComponent(token)}`;
  const message = [
    `Hola${dest.owner_name ? ` ${dest.owner_name}` : ""}.`,
    `Soy el equipo de ${pol.name}${pol.ballot_number ? ` (Tarjetón ${pol.ballot_number})` : ""}.`,
    `Queremos solicitar tu autorización para publicar contenido (cuando sea aprobado editorialmente) en esta red:`,
    `${dest.network_name}: ${dest.profile_or_page_url}`,
    "",
    `Para aprobar o rechazar, usa este enlace (expira en 5 horas):`,
    invite_url,
    "",
    "Si no lo apruebas explícitamente, no se publicará nada.",
  ].join("\n");

  const whatsapp_url = waMeLink(phone, message);

  // Insert invite row and reset destination status to pending.
  const { error: invErr } = await supabase.from("politician_social_auth_invites").insert({
    destination_id: dest.id,
    token_hash,
    expires_at,
    used_at: null,
    decision: null,
  });
  if (invErr) return NextResponse.json({ error: "invite_insert_failed" }, { status: 500 });

  await supabase
    .from("politician_social_destinations")
    .update({
      authorization_status: "pending",
      active: true,
      last_invite_sent_at: new Date(now).toISOString(),
      revoked_at: null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", dest.id);

  return NextResponse.json({ ok: true, invite_url, whatsapp_url, expires_at });
}

