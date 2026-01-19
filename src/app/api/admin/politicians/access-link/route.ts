import { NextResponse } from "next/server";
import { createHash, randomBytes } from "node:crypto";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { readJsonBodyWithLimit } from "@/lib/automation/readBody";
import { getSiteUrlString } from "@/lib/site";

export const runtime = "nodejs";

function sha256Hex(input: string): string {
  return createHash("sha256").update(input).digest("hex");
}

export async function POST(req: Request) {
  const supabase = await createSupabaseServerClient();
  if (!supabase) return NextResponse.json({ error: "supabase_not_configured" }, { status: 503 });

  const { data: authData } = await supabase.auth.getUser();
  const user = authData.user;
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { data: me } = await supabase.from("profiles").select("role").eq("id", user.id).maybeSingle();
  if (!me || (me.role !== "admin" && me.role !== "super_admin")) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const body = await readJsonBodyWithLimit(req);
  if (!body.ok) return NextResponse.json({ error: body.error }, { status: 400 });
  if (!body.data || typeof body.data !== "object") return NextResponse.json({ error: "invalid_body" }, { status: 400 });

  const b = body.data as Record<string, unknown>;
  const politician_id = typeof b.politician_id === "string" ? b.politician_id.trim() : "";
  if (!politician_id) return NextResponse.json({ error: "politician_id_required" }, { status: 400 });

  // Ensure politician exists (RLS: admins can read)
  const { data: pol } = await supabase.from("politicians").select("id").eq("id", politician_id).maybeSingle();
  if (!pol) return NextResponse.json({ error: "not_found" }, { status: 404 });

  // Generate random token, store only hash
  const token = randomBytes(32).toString("base64url");
  const token_hash = sha256Hex(token);

  const { error } = await supabase.from("politician_access_tokens").insert({
    politician_id,
    token_hash,
    expires_at: null,
  });
  if (error) return NextResponse.json({ error: "db_error" }, { status: 500 });

  const base = getSiteUrlString();
  const url = `${base}/politico/access?token=${encodeURIComponent(token)}`;

  return NextResponse.json({ ok: true, url });
}

