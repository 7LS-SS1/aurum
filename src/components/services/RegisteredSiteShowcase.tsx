import { prisma } from "@/lib/prisma";
import { sitePreviewUrl } from "@/lib/site-preview";
import { SiteShowcase } from "./SiteShowcase";
export async function RegisteredSiteShowcase() {
  let sites: { name: string; url: string; image: string }[] = [];
  try {
    const registered = await prisma.targetSite.findMany({ where: { isActive: true }, select: { name: true, baseUrl: true }, orderBy: { name: "asc" }, take: 60 });
    sites = registered.flatMap(site => {
      try { const url = new URL(site.baseUrl); if (url.username || url.password) return []; const origin = url.origin + "/"; const image = sitePreviewUrl(origin); return image ? [{ name: site.name, url: origin, image }] : []; } catch { return []; }
    }).filter((site, index, all) => all.findIndex(other => other.url === site.url) === index)
      .sort((a,b) => Number(!/\/\/(doomhee\.com|thaitube\.live)\//.test(a.url)) - Number(!/\/\/(doomhee\.com|thaitube\.live)\//.test(b.url))).slice(0, 6);
  } catch { /* Public sales page remains available if the registry is unavailable. */ }
  return <SiteShowcase sites={sites}/>;
}
