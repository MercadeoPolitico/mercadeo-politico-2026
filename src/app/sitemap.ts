import type { MetadataRoute } from "next";
import { getSiteUrlString } from "@/lib/site";

export default function sitemap(): MetadataRoute.Sitemap {
  const now = new Date();
  const base = getSiteUrlString();

  const routes = [
    { path: "/", changeFrequency: "weekly", priority: 1 },
    { path: "/candidates", changeFrequency: "weekly", priority: 0.9 },
    { path: "/blog", changeFrequency: "weekly", priority: 0.7 },
    { path: "/about", changeFrequency: "monthly", priority: 0.6 },
  ] as const;

  return routes.map((r) => ({
    url: `${base}${r.path}`,
    lastModified: now,
    changeFrequency: r.changeFrequency,
    priority: r.priority,
  }));
}

