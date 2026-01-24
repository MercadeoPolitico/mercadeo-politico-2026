import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

type Candidate = { id: string; name: string; office: string; region: string; ballot_number: number | null };
type Destination = {
  id: string;
  politician_id: string;
  network_name: string;
  network_key?: string | null;
  scope?: "page" | "profile" | "channel" | string | null;
  target_id?: string | null;
  credential_ref?: string | null;
  network_type: string;
  profile_or_page_url: string;
  owner_name: string | null;
  owner_contact_phone: string | null;
  owner_contact_email: string | null;
  active: boolean;
  authorization_status: "pending" | "approved" | "expired" | "revoked";
  last_invite_sent_at: string | null;
  authorized_at: string | null;
  revoked_at: string | null;
  created_at: string;
  updated_at: string;
};
type Invite = { destination_id: string; expires_at: string; used_at: string | null; decision: string | null; created_at: string };

function isExpired(expiresAt: string): boolean {
  const t = Date.parse(expiresAt);
  if (!Number.isFinite(t)) return false;
  return t <= Date.now();
}

export async function GET() {
  await requireAdmin();
  const supabase = await createSupabaseServerClient();
  if (!supabase) return NextResponse.json({ error: "not_configured" }, { status: 503 });

  const { data: candidates } = await supabase
    .from("politicians")
    .select("id,name,office,region,ballot_number,updated_at")
    .order("name", { ascending: true });

  const { data: destinations } = await supabase
    .from("politician_social_destinations")
    .select(
      "id,politician_id,network_name,network_key,scope,target_id,credential_ref,network_type,profile_or_page_url,owner_name,owner_contact_phone,owner_contact_email,authorized_by_name,authorized_by_phone,authorized_by_email,active,authorization_status,last_invite_sent_at,authorized_at,revoked_at,created_at,updated_at",
    )
    .order("created_at", { ascending: false });

  const destRows = (destinations ?? []) as Destination[];
  const destIds = destRows.map((d) => d.id);

  const { data: invites } = destIds.length
    ? await supabase
        .from("politician_social_auth_invites")
        .select("destination_id,expires_at,used_at,decision,created_at")
        .in("destination_id", destIds)
        .order("created_at", { ascending: false })
    : { data: [] as any[] };

  const latestInviteByDest: Record<string, Invite> = {};
  for (const i of (invites ?? []) as Invite[]) {
    if (!latestInviteByDest[i.destination_id]) latestInviteByDest[i.destination_id] = i;
  }

  // Expire pending destinations whose latest invite is expired and unused.
  const toExpire = destRows
    .filter((d) => d.authorization_status === "pending")
    .filter((d) => {
      const inv = latestInviteByDest[d.id];
      return Boolean(inv && !inv.used_at && isExpired(inv.expires_at));
    })
    .map((d) => d.id);

  if (toExpire.length) {
    await supabase
      .from("politician_social_destinations")
      .update({ authorization_status: "expired", updated_at: new Date().toISOString() })
      .in("id", toExpire);
    // Reflect in response
    for (const d of destRows) {
      if (toExpire.includes(d.id)) (d as any).authorization_status = "expired";
    }
  }

  const stats = (() => {
    const total = destRows.length;
    const approved = destRows.filter((d) => d.authorization_status === "approved" && d.active).length;
    const pending = destRows.filter((d) => d.authorization_status === "pending" && d.active).length;
    const expired = destRows.filter((d) => d.authorization_status === "expired" && d.active).length;
    return { total, approved, pending, expired };
  })();

  return NextResponse.json({
    ok: true,
    candidates: (candidates ?? []) as Candidate[],
    destinations: destRows,
    latest_invites: latestInviteByDest,
    stats,
  });
}

