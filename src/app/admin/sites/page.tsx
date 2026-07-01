import { prisma } from "@/lib/prisma";
import { SitesManager } from "@/components/admin/SitesManager";

export default async function SitesPage() {
  const sites = await prisma.targetSite.findMany({
    select: {
      id: true,
      name: true,
      baseUrl: true,
      postType: true,
      isActive: true,
      healthStatus: true,
    },
    orderBy: { createdAt: "asc" },
  });

  return (
    <section>
      <div className="page-head">
        <h1>
          <span className="g">เว็บปลายทาง</span>
        </h1>
        <p>จัดการเว็บ WordPress ปลายทาง — กุญแจ (Application Password / JWT) ถูกเข้ารหัส AES-256-GCM ก่อนบันทึก ไม่มีการเก็บ plaintext</p>
      </div>
      <SitesManager initialSites={sites} />
    </section>
  );
}
