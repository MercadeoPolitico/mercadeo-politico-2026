import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { oauthClientConfig } from "@/lib/oauth/providers";

export const runtime = "nodejs";

export async function GET() {
  await requireAdmin();
  const supabase = await createSupabaseServerClient();
  if (!supabase) return NextResponse.json({ ok: false, error: "not_configured" }, { status: 503 });

  const meta = oauthClientConfig("meta");
  const x = oauthClientConfig("x");
  const reddit = oauthClientConfig("reddit");

  // Connection counts (no secrets).
  const { data: rows } = await supabase
    .from("social_oauth_connections")
    .select("provider", { count: "exact" })
    .in("provider", ["meta", "x", "reddit"]);

  const counts = { meta: 0, x: 0, reddit: 0 };
  for (const r of (rows ?? []) as any[]) {
    const p = String(r?.provider ?? "");
    if (p === "meta") counts.meta++;
    if (p === "x") counts.x++;
    if (p === "reddit") counts.reddit++;
  }

  const hasEncryptionKey = Boolean(String(process.env.OAUTH_TOKEN_ENCRYPTION_KEY ?? "").trim());

  return NextResponse.json({
    ok: true,
    providers: {
      meta: { configured: meta.configured },
      x: { configured: x.configured },
      reddit: { configured: reddit.configured },
    },
    has_encryption_key: hasEncryptionKey,
    counts,
  });
}

