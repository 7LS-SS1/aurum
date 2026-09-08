import { prisma } from "@/lib/prisma";
import { ActorsManager } from "@/components/admin/ActorsManager";
import { requireMinRole } from "@/lib/authz";
import { can } from "@/lib/permissions";

const PAGE_SIZE = 20;

export default async function ActorsPage() {
  const user = await requireMinRole("STAFF");
  const canPush = can(user.role, "actor:push") && process.env.ACTOR_SYNC_ENABLED !== "false";
  const [actors, total, pushSites] = await Promise.all([
    prisma.actor.findMany({
      take: PAGE_SIZE,
      orderBy: { name: "asc" },
      select: { id: true, name: true, age: true, heightCm: true, weightKg: true, profileImageUrl: true },
    }),
    prisma.actor.count(),
    canPush ? prisma.targetSite.findMany({
      where: { isActive: true }, select: { id: true, name: true }, orderBy: { name: "asc" },
    }) : Promise.resolve([]),
  ]);

  return (
    <section>
      <div className="page-head">
        <h1>
          <span className="g">นักแสดง</span>ทั้งหมด
        </h1>
        <p>รายชื่อนักแสดง — ดู แก้ไข หรือลบ</p>
      </div>
      <ActorsManager
        canPush={canPush}
        pushSites={pushSites}
        initialActors={actors}
        initialPagination={{ page: 1, totalPages: Math.max(1, Math.ceil(total / PAGE_SIZE)), total, pageSize: PAGE_SIZE }}
      />
    </section>
  );
}
