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
  if (isNonEmptyString(b.slug)) {
    const slug = b.slug.trim().toLowerCase();
    if (!isSlug(slug)) return NextResponse.json({ error: "invalid_slug" }, { status: 400 });
    patch.slug = slug;
  }
  if (isNonEmptyString(b.name)) patch.name = b.name.trim();
  if (isNonEmptyString(b.office)) patch.office = b.office.trim();
  if (typeof b.party === "string") patch.party = b.party.trim() ? b.party.trim() : null;
  if (isNonEmptyString(b.region)) patch.region = b.region.trim();
  if (typeof b.ballot_number === "number" && Number.isFinite(b.ballot_number)) patch.ballot_number = b.ballot_number;
  if (b.ballot_number === null) patch.ballot_number = null;
  if (typeof b.biography === "string") patch.biography = b.biography;
  if (typeof b.proposals === "string") patch.proposals = b.proposals;
  if (typeof b.auto_blog_enabled === "boolean") patch.auto_blog_enabled = b.auto_blog_enabled;
  if (typeof b.auto_publish_enabled === "boolean") patch.auto_publish_enabled = b.auto_publish_enabled;

  patch.updated_at = new Date().toISOString();

  if (Object.keys(patch).length <= 1) return NextResponse.json({ error: "nothing_to_update" }, { status: 400 });

  const { error } = await supabase.from("politicians").update(patch).eq("id", id);
  if (error) return NextResponse.json({ error: "update_failed" }, { status: 400 });
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

  const { error } = await supabase.from("politicians").delete().eq("id", id);
  if (error) return NextResponse.json({ error: "delete_failed" }, { status: 400 });
  return NextResponse.json({ ok: true });
}

