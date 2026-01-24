import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { readJsonBodyWithLimit } from "@/lib/automation/readBody";

export const runtime = "nodejs";

function isNonEmptyString(v: unknown): v is string {
  return typeof v === "string" && v.trim().length > 0;
}

type NetworkType = "official" | "ally" | "follower" | "community" | "media";
function isNetworkType(v: string): v is NetworkType {
  return ["official", "ally", "follower", "community", "media"].includes(v);
}

type NetworkKey = "facebook" | "instagram" | "threads" | "x" | "telegram" | "reddit";
function isNetworkKey(v: string): v is NetworkKey {
  return ["facebook", "instagram", "threads", "x", "telegram", "reddit"].includes(v);
}

type Scope = "page" | "profile" | "channel";
function isScope(v: string): v is Scope {
  return ["page", "profile", "channel"].includes(v);
}

export async function POST(req: Request) {
  await requireAdmin();
  const supabase = await createSupabaseServerClient();
  if (!supabase) return NextResponse.json({ error: "not_configured" }, { status: 503 });

  const body = await readJsonBodyWithLimit(req);
  if (!body.ok) return NextResponse.json({ error: body.error }, { status: 400 });
  if (!body.data || typeof body.data !== "object") return NextResponse.json({ error: "invalid_body" }, { status: 400 });

  const b = body.data as Record<string, unknown>;
  const politician_id = isNonEmptyString(b.politician_id) ? b.politician_id.trim() : "";
  const network_name = isNonEmptyString(b.network_name) ? b.network_name.trim() : "";
  const network_key = isNonEmptyString(b.network_key) ? b.network_key.trim().toLowerCase() : "";
  const scope = isNonEmptyString(b.scope) ? b.scope.trim().toLowerCase() : "profile";
  const target_id = isNonEmptyString(b.target_id) ? b.target_id.trim() : null;
  const credential_ref = isNonEmptyString(b.credential_ref) ? b.credential_ref.trim() : null;
  const network_type = isNonEmptyString(b.network_type) ? b.network_type.trim().toLowerCase() : "official";
  const profile_or_page_url = isNonEmptyString(b.profile_or_page_url) ? b.profile_or_page_url.trim() : "";
  const owner_name = isNonEmptyString(b.owner_name) ? b.owner_name.trim() : null;
  const owner_contact_phone = isNonEmptyString(b.owner_contact_phone) ? b.owner_contact_phone.trim() : null;
  const owner_contact_email = isNonEmptyString(b.owner_contact_email) ? b.owner_contact_email.trim() : null;
  const active = typeof b.active === "boolean" ? b.active : true;

  if (!politician_id) return NextResponse.json({ error: "politician_id_required" }, { status: 400 });
  if (!network_name) return NextResponse.json({ error: "network_name_required" }, { status: 400 });
  if (!profile_or_page_url) return NextResponse.json({ error: "profile_or_page_url_required" }, { status: 400 });
  if (!/^https?:\/\//i.test(profile_or_page_url)) return NextResponse.json({ error: "url_invalid" }, { status: 400 });
  if (!isNetworkType(network_type)) return NextResponse.json({ error: "network_type_invalid" }, { status: 400 });
  if (network_key && !isNetworkKey(network_key)) return NextResponse.json({ error: "network_key_invalid" }, { status: 400 });
  if (scope && !isScope(scope)) return NextResponse.json({ error: "scope_invalid" }, { status: 400 });

  const now = new Date().toISOString();

  const { data, error } = await supabase
    .from("politician_social_destinations")
    .insert({
      politician_id,
      network_name,
      network_key: network_key || null,
      scope,
      target_id,
      credential_ref,
      network_type,
      profile_or_page_url,
      owner_name,
      owner_contact_phone,
      owner_contact_email,
      active,
      authorization_status: "pending",
      updated_at: now,
    })
    .select("id")
    .single();

  if (error || !data?.id) return NextResponse.json({ error: "insert_failed" }, { status: 500 });
  return NextResponse.json({ ok: true, id: data.id });
}

export async function PATCH(req: Request) {
  await requireAdmin();
  const supabase = await createSupabaseServerClient();
  if (!supabase) return NextResponse.json({ error: "not_configured" }, { status: 503 });

  const body = await readJsonBodyWithLimit(req);
  if (!body.ok) return NextResponse.json({ error: body.error }, { status: 400 });
  if (!body.data || typeof body.data !== "object") return NextResponse.json({ error: "invalid_body" }, { status: 400 });

  const b = body.data as Record<string, unknown>;
  const id = isNonEmptyString(b.id) ? b.id.trim() : "";
  if (!id) return NextResponse.json({ error: "id_required" }, { status: 400 });

  const patch: Record<string, unknown> = {};
  if (isNonEmptyString(b.network_name)) patch.network_name = b.network_name.trim();
  if (b.network_key === null || isNonEmptyString(b.network_key)) {
    const nk = b.network_key === null ? "" : String(b.network_key).trim().toLowerCase();
    if (nk && !isNetworkKey(nk)) return NextResponse.json({ error: "network_key_invalid" }, { status: 400 });
    patch.network_key = nk ? nk : null;
  }
  if (b.scope === null || isNonEmptyString(b.scope)) {
    const sc = b.scope === null ? "" : String(b.scope).trim().toLowerCase();
    if (!sc) {
      // keep as-is by not patching
    } else {
      if (!isScope(sc)) return NextResponse.json({ error: "scope_invalid" }, { status: 400 });
      patch.scope = sc;
    }
  }
  if (b.target_id === null || isNonEmptyString(b.target_id)) patch.target_id = b.target_id ? String(b.target_id).trim() : null;
  if (b.credential_ref === null || isNonEmptyString(b.credential_ref)) patch.credential_ref = b.credential_ref ? String(b.credential_ref).trim() : null;
  if (isNonEmptyString(b.network_type)) {
    const nt = b.network_type.trim().toLowerCase();
    if (!isNetworkType(nt)) return NextResponse.json({ error: "network_type_invalid" }, { status: 400 });
    patch.network_type = nt;
  }
  if (isNonEmptyString(b.profile_or_page_url)) {
    const url = b.profile_or_page_url.trim();
    if (!/^https?:\/\//i.test(url)) return NextResponse.json({ error: "url_invalid" }, { status: 400 });
    patch.profile_or_page_url = url;
  }
  if (b.owner_name === null || isNonEmptyString(b.owner_name)) patch.owner_name = b.owner_name ? String(b.owner_name).trim() : null;
  if (b.owner_contact_phone === null || isNonEmptyString(b.owner_contact_phone))
    patch.owner_contact_phone = b.owner_contact_phone ? String(b.owner_contact_phone).trim() : null;
  if (b.owner_contact_email === null || isNonEmptyString(b.owner_contact_email))
    patch.owner_contact_email = b.owner_contact_email ? String(b.owner_contact_email).trim() : null;
  if (typeof b.active === "boolean") patch.active = b.active;

  if (isNonEmptyString(b.authorization_status)) {
    const s = b.authorization_status.trim();
    if (!["pending", "approved", "expired", "revoked"].includes(s)) return NextResponse.json({ error: "authorization_status_invalid" }, { status: 400 });
    patch.authorization_status = s;
  }

  patch.updated_at = new Date().toISOString();

  const { error } = await supabase.from("politician_social_destinations").update(patch).eq("id", id);
  if (error) return NextResponse.json({ error: "update_failed" }, { status: 500 });
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: Request) {
  await requireAdmin();
  const supabase = await createSupabaseServerClient();
  if (!supabase) return NextResponse.json({ error: "not_configured" }, { status: 503 });

  const body = await readJsonBodyWithLimit(req);
  if (!body.ok) return NextResponse.json({ error: body.error }, { status: 400 });
  if (!body.data || typeof body.data !== "object") return NextResponse.json({ error: "invalid_body" }, { status: 400 });

  const b = body.data as Record<string, unknown>;
  const id = isNonEmptyString(b.id) ? b.id.trim() : "";
  if (!id) return NextResponse.json({ error: "id_required" }, { status: 400 });

  const { error } = await supabase.from("politician_social_destinations").delete().eq("id", id);
  if (error) return NextResponse.json({ error: "delete_failed" }, { status: 500 });
  return NextResponse.json({ ok: true });
}

