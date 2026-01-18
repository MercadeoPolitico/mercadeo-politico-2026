export const siteConfig = {
  name: "Mercadeo Político 2026",
  description:
    "Plataforma de mercadeo político digital para Colombia 2026 (enfoque Meta). Comunicación ética, legal y transparente.",
} as const;

/**
 * Returns a safe, normalized site URL string.
 *
 * Notes:
 * - Accepts values like `https://example.com` or `http://localhost:3000`.
 * - If someone sets `example.com` (no scheme), we assume `https://`.
 * - If invalid/missing, we fall back to localhost to avoid build-time crashes.
 */
export function getSiteUrlString(): string {
  const raw = process.env.NEXT_PUBLIC_SITE_URL?.trim();
  if (!raw) return "http://localhost:3000";

  const withScheme = raw.startsWith("http://") || raw.startsWith("https://") ? raw : `https://${raw}`;

  try {
    // Validate
    const parsed = new URL(withScheme);
    void parsed;
    return withScheme;
  } catch {
    return "http://localhost:3000";
  }
}

export function getSiteUrl(): URL {
  return new URL(getSiteUrlString());
}

