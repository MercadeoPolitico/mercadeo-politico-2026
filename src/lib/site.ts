export const siteConfig = {
  name: "Mercadeo Político 2026",
  description:
    "Plataforma de mercadeo político digital para Colombia 2026 (enfoque Meta). Comunicación ética, legal y transparente.",
  // IMPORTANT: set this to your production domain once you deploy on Vercel.
  // During local dev, leaving it as localhost is fine.
  url: process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000",
} as const;

