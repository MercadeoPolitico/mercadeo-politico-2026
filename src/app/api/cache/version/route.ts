import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

function buildCacheVersion(): string {
  // Prefer Vercel-provided identifiers so every deploy changes the version.
  // This prevents "stale HTML -> missing CSS" scenarios on clients that cache aggressively.
  const fromEnv =
    process.env.VERCEL_DEPLOYMENT_ID ||
    process.env.VERCEL_GIT_COMMIT_SHA ||
    process.env.VERCEL_BUILD_ID ||
    process.env.NEXT_PUBLIC_VERCEL_GIT_COMMIT_SHA ||
    "";
  const v = String(fromEnv || "").trim();
  return v ? `build:${v}` : "build:local";
}

export async function GET() {
  const supabase = await createSupabaseServerClient();
  // Even if Supabase is not configured, we still return a build-based version so cache resets can happen on deploys.
  if (!supabase) return NextResponse.json({ ok: true, version: `${buildCacheVersion()}|db:0` });

  const { data } = await supabase.from("app_settings").select("value").eq("key", "cache_version").maybeSingle();
  const version = typeof data?.value === "string" && data.value.trim().length ? data.value.trim() : "0";

  // Combine build + db version to support both:
  // - automatic reset on every deploy (build changes)
  // - manual global reset from Admin → CacheResetCard (db changes)
  return NextResponse.json({ ok: true, version: `${buildCacheVersion()}|db:${version}` });
}

