import { prisma } from "@/lib/prisma";
import { sitePreviewUrl } from "@/lib/site-preview";
import { WebsiteGallery } from "@/components/services/WebsiteGallery";

export const metadata = { title: "เว็บไซต์ตัวอย่าง | AURUM", description: "สำรวจเว็บไซต์ที่เชื่อมต่อกับ AURUM พร้อมภาพตัวอย่างและลิงก์เข้าชมเว็บไซต์จริง" };
export const dynamic = "force-dynamic";

export default async function WebsitesPage() {
  try {
    // Explicit public projection: never send integration credentials or internal status logs.
    const registered = await prisma.targetSite.findMany({
      select: { name: true, baseUrl: true, isActive: true },
      orderBy: { name: "asc" },
    });
    const sites = registered.flatMap(site => {
      try {
        const parsed = new URL(site.baseUrl);
        if (parsed.username || parsed.password || !sitePreviewUrl(parsed.origin + "/")) return [];
        return [{ name: site.name, url: parsed.origin + "/", active: site.isActive }];
      } catch { return []; }
    }).filter((site, index, all) => all.findIndex(other => other.url === site.url) === index);
    return <WebsiteGallery sites={sites} />;
  } catch {
    return <WebsiteGallery sites={[]} unavailable />;
  }
}
