/**
 * Client-safe OAuth provider type and normalization (no env, no server-only).
 * Use this from Client Components. Use @/lib/oauth/providers for server (oauthClientConfig).
 */
export type OAuthProvider = "meta" | "x" | "reddit";

export function isOAuthProvider(v: string): v is OAuthProvider {
  return v === "meta" || v === "x" || v === "reddit";
}

/**
 * Normalize provider aliases from URL/input. Canonical: meta | x | reddit.
 */
export function normalizeOAuthProvider(raw: string): OAuthProvider | null {
  const v = String(raw || "").trim().toLowerCase();
  if (!v) return null;
  if (v === "meta" || v === "facebook" || v === "instagram" || v === "threads") return "meta";
  if (v === "x" || v === "twitter") return "x";
  if (v === "reddit") return "reddit";
  return null;
}
