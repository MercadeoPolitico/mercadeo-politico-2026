import { NextResponse } from "next/server";
import { createHash, randomBytes } from "node:crypto";
import { readJsonBodyWithLimit } from "@/lib/automation/readBody";
import { getSiteUrlString } from "@/lib/site";
import { requireAdmin } from "@/lib/auth/admin";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";

function sha256Hex(input: string): string {
  return createHash("sha256").update(input).digest("hex");
}

export async function POST(req: Request) {
  await requireAdmin();

  const admin = createSupabaseAdminClient();
  if (!admin) return NextResponse.json({ error: "supabase_not_configured" }, { status: 503 });

  const body = await readJsonBodyWithLimit(req);
  if (!body.ok) return NextResponse.json({ error: body.error }, { status: 400 });
  if (!body.data || typeof body.data !== "object") return NextResponse.json({ error: "invalid_body" }, { status: 400 });

  const b = body.data as Record<string, unknown>;
  const politician_id = typeof b.politician_id === "string" ? b.politician_id.trim() : "";
  if (!politician_id) return NextResponse.json({ error: "politician_id_required" }, { status: 400 });

  // Ensure politician exists (RLS: admins can read)
  const { data: pol } = await admin.from("politicians").select("id").eq("id", politician_id).maybeSingle();
  if (!pol) return NextResponse.json({ error: "not_found" }, { status: 404 });

  // Generate random token, store only hash
  const token = randomBytes(32).toString("base64url");
  const token_hash = sha256Hex(token);

  const { error } = await admin.from("politician_access_tokens").insert({
    politician_id,
    token_hash,
    expires_at: null,
  });
  if (error) return NextResponse.json({ error: "db_error" }, { status: 500 });

  const base = getSiteUrlString();
  const url = `${base}/politico/access?token=${encodeURIComponent(token)}`;

  return NextResponse.json({ ok: true, url });
}

