import type { MetadataRoute } from "next";
import { getSiteUrlString } from "@/lib/site";
import { getCandidates } from "@/lib/candidates/getCandidates";

export default function sitemap(): MetadataRoute.Sitemap {
  const now = new Date();
  const base = getSiteUrlString();

  type ChangeFreq = NonNullable<MetadataRoute.Sitemap[number]["changeFrequency"]>;
  type RouteDef = { path: string; changeFrequency: ChangeFreq; priority: number };

  const routes: RouteDef[] = [
    { path: "/", changeFrequency: "weekly", priority: 1 },
    { path: "/candidates", changeFrequency: "weekly", priority: 0.9 },
    { path: "/centro-informativo", changeFrequency: "daily", priority: 0.9 },
    { path: "/blog", changeFrequency: "weekly", priority: 0.7 },
    { path: "/about", changeFrequency: "monthly", priority: 0.6 },
  ];

  const candidateRoutes: RouteDef[] = (() => {
    try {
      const cands = getCandidates();
      return cands.flatMap((c) => [
        { path: `/candidates/${c.slug}`, changeFrequency: "weekly", priority: 0.85 },
        { path: `/candidates/${c.slug}/propuesta`, changeFrequency: "weekly", priority: 0.8 },
      ]);
    } catch {
      return [];
    }
  })();

  return [...routes, ...candidateRoutes].map((r) => ({
    url: `${base}${r.path}`,
    lastModified: now,
    changeFrequency: r.changeFrequency,
    priority: r.priority,
  }));
}

