import type { MetadataRoute } from "next";
import { getSiteUrlString } from "@/lib/site";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
    },
    sitemap: `${getSiteUrlString()}/sitemap.xml`,
  };
}

