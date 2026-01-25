import "server-only";

export type OAuthProvider = "meta" | "x" | "reddit";

function envOptional(name: string): string {
  return String(process.env[name] ?? "").trim();
}

export function isOAuthProvider(v: string): v is OAuthProvider {
  return v === "meta" || v === "x" || v === "reddit";
}

export function oauthClientConfig(provider: OAuthProvider): { clientId: string; clientSecret: string; configured: boolean } {
  const idName =
    provider === "meta"
      ? "OAUTH_META_CLIENT_ID"
      : provider === "x"
        ? "OAUTH_X_CLIENT_ID"
        : "OAUTH_REDDIT_CLIENT_ID";
  const secretName =
    provider === "meta"
      ? "OAUTH_META_CLIENT_SECRET"
      : provider === "x"
        ? "OAUTH_X_CLIENT_SECRET"
        : "OAUTH_REDDIT_CLIENT_SECRET";

  const clientId = envOptional(idName);
  const clientSecret = envOptional(secretName);
  return { clientId, clientSecret, configured: Boolean(clientId && clientSecret) };
}

