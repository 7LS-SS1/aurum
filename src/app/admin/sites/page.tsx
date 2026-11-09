import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { TargetSitesManager } from "@/components/admin/TargetSitesManager";

export default async function SitesPage() {
  const session = await auth();
  const [videoSites, comicSites, mainCategories] = await Promise.all([
    prisma.targetSite.findMany({
      select: {
        id: true,
        name: true,
        baseUrl: true,
        postType: true,
        categoryRestBase: true,
        tagRestBase: true,
        mainCategories: true,
        isActive: true,
        healthStatus: true,
        createdAt: true,
      },
      orderBy: { createdAt: "asc" },
    }),
    prisma.comicTargetSite.findMany({
      select: {
        id: true,
        name: true,
        baseUrl: true,
        postType: true,
        comicTypes: true,
        isActive: true,
        healthStatus: true,
        createdAt: true,
      },
      orderBy: { createdAt: "asc" },
    }),
    prisma.mainCategory.findMany({ select: { id: true, name: true }, orderBy: { name: "asc" } }),
  ]);

  return (
    <section>
      <div className="page-head">
        <h1>
          <span className="g">เว็บปลายทาง</span>
        </h1>
        <p>ดูสถานะการเชื่อมต่อ เลือกประเภทเนื้อหา และจัดการการเผยแพร่ไปยังเว็บไซต์ WordPress ของคุณ</p>
      </div>
      <TargetSitesManager
        initialVideoSites={JSON.parse(JSON.stringify(videoSites))}
        initialComicSites={JSON.parse(JSON.stringify(comicSites))}
        mainCategories={mainCategories}
        role={session!.user.role}
      />
    </section>
  );
}
