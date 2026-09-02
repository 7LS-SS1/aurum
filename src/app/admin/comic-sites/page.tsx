import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { ComicSitesManager } from "@/components/admin/ComicSitesManager";

export default async function ComicSitesPage() {
  const session = await auth();
  const sites = await prisma.comicTargetSite.findMany({
    select: {
      id: true,
      name: true,
      baseUrl: true,
      postType: true,
      comicTypes: true,
      isActive: true,
      healthStatus: true,
    },
    orderBy: { createdAt: "asc" },
  });

  return (
    <section>
      <div className="page-head">
        <h1>
          <span className="g">เว็บปลายทาง</span> (Doujin/Comic)
        </h1>
        <p>จัดการเว็บ WordPress ปลายทางสำหรับ Doujin/Comic โดยเฉพาะ — แยกจากเว็บปลายทางของวิดีโอ กุญแจถูกเข้ารหัส AES-256-GCM ก่อนบันทึก</p>
      </div>
      <ComicSitesManager initialSites={sites} role={session!.user.role} />
    </section>
  );
}
