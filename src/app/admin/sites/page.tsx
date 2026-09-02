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
        <p>จัดการเว็บ WordPress ปลายทางสำหรับทั้งวิดีโอและ Doujin/Comic ในที่เดียว — เลือกประเภทเนื้อหาตอนเพิ่มเว็บใหม่ กุญแจ (Application Password / JWT) ถูกเข้ารหัส AES-256-GCM ก่อนบันทึก</p>
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
