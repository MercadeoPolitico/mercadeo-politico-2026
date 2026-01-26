import type { MetadataRoute } from "next";
import { getSiteUrlString } from "@/lib/site";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: ["/", "/sitemap.xml", "/robots.txt"],
        disallow: [
          "/admin",
          "/api",
          "/autorizar",
          "/connect",
          "/politico/access",
        ],
      },
    ],
    sitemap: `${getSiteUrlString()}/sitemap.xml`,
  };
}

