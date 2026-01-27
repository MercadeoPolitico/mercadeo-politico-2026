import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { getSiteUrlString } from "@/lib/site";
import { oauthClientConfig, isOAuthProvider, type OAuthProvider } from "@/lib/oauth/providers";
import { randomStateToken, sha256Hex, encryptSecret } from "@/lib/oauth/crypto";
import crypto from "node:crypto";

export const runtime = "nodejs";

function missingEnvForProvider(p: OAuthProvider): string[] {
  const miss: string[] = [];
  const cfg = oauthClientConfig(p);
  if (!cfg.clientId) miss.push(p === "meta" ? "OAUTH_META_CLIENT_ID" : p === "x" ? "OAUTH_X_CLIENT_ID" : "OAUTH_REDDIT_CLIENT_ID");
  if (!cfg.clientSecret) miss.push(p === "meta" ? "OAUTH_META_CLIENT_SECRET" : p === "x" ? "OAUTH_X_CLIENT_SECRET" : "OAUTH_REDDIT_CLIENT_SECRET");
  if (!String(process.env.OAUTH_TOKEN_ENCRYPTION_KEY ?? "").trim()) miss.push("OAUTH_TOKEN_ENCRYPTION_KEY");
  return miss;
}

function callbackUrl(provider: OAuthProvider): string {
  return `${getSiteUrlString()}/api/public/oauth/${provider}/callback`;
}

function metaAuthorizeUrl(params: { clientId: string; redirectUri: string; state: string }): string {
  const u = new URL("https://www.facebook.com/v19.0/dialog/oauth");
  u.searchParams.set("client_id", params.clientId);
  u.searchParams.set("redirect_uri", params.redirectUri);
  u.searchParams.set("state", params.state);
  u.searchParams.set("response_type", "code");
  u.searchParams.set(
    "scope",
    [
      "pages_show_list",
      "pages_read_engagement",
      "pages_manage_posts",
      "instagram_basic",
      "instagram_content_publish",
    ].join(","),
  );
  return u.toString();
}

function sha256Base64Url(input: string): string {
  const digest = crypto.createHash("sha256").update(input).digest();
  return digest.toString("base64").replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
}

function xAuthorizeUrl(params: { clientId: string; redirectUri: string; state: string; codeChallenge: string }): string {
  const u = new URL("https://twitter.com/i/oauth2/authorize");
  u.searchParams.set("response_type", "code");
  u.searchParams.set("client_id", params.clientId);
  u.searchParams.set("redirect_uri", params.redirectUri);
  u.searchParams.set("state", params.state);
  u.searchParams.set("code_challenge", params.codeChallenge);
  u.searchParams.set("code_challenge_method", "S256");
  u.searchParams.set("scope", ["tweet.read", "tweet.write", "users.read", "offline.access"].join(" "));
  return u.toString();
}

function redditAuthorizeUrl(params: { clientId: string; redirectUri: string; state: string }): string {
  const u = new URL("https://www.reddit.com/api/v1/authorize");
  u.searchParams.set("client_id", params.clientId);
  u.searchParams.set("response_type", "code");
  u.searchParams.set("state", params.state);
  u.searchParams.set("redirect_uri", params.redirectUri);
  u.searchParams.set("duration", "permanent");
  u.searchParams.set("scope", ["identity", "submit"].join(" "));
  return u.toString();
}

export async function GET(req: Request, { params }: { params: Promise<{ provider: string }> }) {
  const { provider: rawProvider } = await params;
  if (!isOAuthProvider(rawProvider)) return NextResponse.json({ ok: false, error: "invalid_provider" }, { status: 400 });
  const provider = rawProvider as OAuthProvider;

  const u = new URL(req.url);
  const candidateId = String(u.searchParams.get("candidate_id") ?? "").trim();
  if (!candidateId) return NextResponse.json({ ok: false, error: "candidate_id_required" }, { status: 400 });

  const missing = missingEnvForProvider(provider);
  if (missing.length) return NextResponse.json({ ok: false, error: "not_configured", missing }, { status: 503 });

  const admin = createSupabaseAdminClient();
  if (!admin) return NextResponse.json({ ok: false, error: "not_configured" }, { status: 503 });

  const state = randomStateToken(24);
  const stateHash = sha256Hex(state);
  const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString(); // 10 min

  const { error } = await admin.from("social_oauth_states").insert({
    provider,
    candidate_id: candidateId,
    state_hash: stateHash,
    expires_at: expiresAt,
    used_at: null,
  });
  if (error) return NextResponse.json({ ok: false, error: "state_insert_failed" }, { status: 500 });

  const { clientId } = oauthClientConfig(provider);
  const redirectUri = callbackUrl(provider);

  if (provider === "meta") {
    return NextResponse.json({ ok: true, auth_url: metaAuthorizeUrl({ clientId, redirectUri, state }) });
  }

  if (provider === "reddit") {
    return NextResponse.json({ ok: true, auth_url: redditAuthorizeUrl({ clientId, redirectUri, state }) });
  }

  // provider === "x": PKCE cookie required.
  const verifier = randomStateToken(48);
  const challenge = sha256Base64Url(verifier);
  const res = NextResponse.json({ ok: true, auth_url: xAuthorizeUrl({ clientId, redirectUri, state, codeChallenge: challenge }) });
  res.cookies.set({
    name: `mp26_pkce_${stateHash}`,
    value: encodeURIComponent(encryptSecret(verifier)),
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    path: `/api/public/oauth/x/callback`,
    maxAge: 10 * 60,
  });
  return res;
}

