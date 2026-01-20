import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { readJsonBodyWithLimit } from "@/lib/automation/readBody";

export const runtime = "nodejs";

function isNonEmptyString(v: unknown): v is string {
  return typeof v === "string" && v.trim().length > 0;
}

function isSlug(v: string): boolean {
  return /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(v);
}

export async function POST(req: Request) {
  await requireAdmin();
  const supabase = await createSupabaseServerClient();
  if (!supabase) return NextResponse.json({ error: "not_configured" }, { status: 503 });

  const body = await readJsonBodyWithLimit(req);
  if (!body.ok) return NextResponse.json({ error: body.error }, { status: 400 });
  if (!body.data || typeof body.data !== "object") return NextResponse.json({ error: "invalid_body" }, { status: 400 });

  const b = body.data as Record<string, unknown>;

  const slug = isNonEmptyString(b.slug) ? b.slug.trim().toLowerCase() : "";
  const name = isNonEmptyString(b.name) ? b.name.trim() : "";
  const office = isNonEmptyString(b.office) ? b.office.trim() : "";
  const region = isNonEmptyString(b.region) ? b.region.trim() : "";
  const party = isNonEmptyString(b.party) ? b.party.trim() : null;

  if (!slug || !isSlug(slug)) return NextResponse.json({ error: "invalid_slug" }, { status: 400 });
  if (!name) return NextResponse.json({ error: "name_required" }, { status: 400 });
  if (!office) return NextResponse.json({ error: "office_required" }, { status: 400 });
  if (!region) return NextResponse.json({ error: "region_required" }, { status: 400 });

  const id = slug; // deterministic

  const { error } = await supabase.from("politicians").insert({
    id,
    slug,
    name,
    office,
    region,
    party,
    biography: "",
    proposals: "",
  });

  if (error) return NextResponse.json({ error: "insert_failed" }, { status: 400 });
  return NextResponse.json({ ok: true, id, slug });
}

