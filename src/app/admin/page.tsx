import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { StatusBreakdownBar, type StatusBucket } from "@/components/admin/StatusBreakdownBar";

const reviewStatuses = ["READY_FOR_REVIEW", "IN_REVIEW", "READY_FOR_APPROVAL"] as const;

// The 11 raw MovieStatus values collapse into 5 stages a reader can actually
// scan at a glance — grouping them any finer turns the strip into noise.
const STAGE_OF: Record<string, StatusBucket["key"]> = {
  DRAFT: "draft",
  READY_FOR_REVIEW: "progress",
  IN_REVIEW: "progress",
  READY_FOR_APPROVAL: "progress",
  APPROVED: "progress",
  PUBLISHING: "progress",
  DONE: "done",
  REJECTED: "blocked",
  PARTIAL: "blocked",
  FAILED: "blocked",
  ARCHIVED: "archived",
};

const STAGE_META: Record<string, { label: string; tone: StatusBucket["tone"] }> = {
  draft: { label: "ร่าง", tone: "neutral" },
  progress: { label: "กำลังดำเนินการ (ตรวจ/อนุมัติ/เผยแพร่)", tone: "gold" },
  done: { label: "เผยแพร่สำเร็จ", tone: "ok" },
  blocked: { label: "ตีกลับ / ล้มเหลว", tone: "bad" },
  archived: { label: "เก็บถาวร", tone: "neutral-2" },
};

const statusLabels: Record<string, string> = {
  DRAFT: "Draft",
  READY_FOR_REVIEW: "รอตรวจ",
  IN_REVIEW: "กำลังตรวจ",
  REJECTED: "ตีกลับ",
  READY_FOR_APPROVAL: "รออนุมัติ",
  APPROVED: "อนุมัติแล้ว",
  PUBLISHING: "กำลังเผยแพร่",
  DONE: "สำเร็จ",
  PARTIAL: "สำเร็จบางส่วน",
  FAILED: "ล้มเหลว",
  ARCHIVED: "เก็บถาวร",
};

function badgeClass(status: string) {
  if (status === "DONE" || status === "APPROVED") return "ok";
  if (status === "FAILED" || status === "REJECTED") return "bad";
  if (status === "DRAFT" || status === "ARCHIVED") return "neutral";
  return "warn";
}

export default async function AdminDashboardPage() {
  const [
    totalMovies,
    reviewQueue,
    failedMovies,
    activeSites,
    unhealthySites,
    failedDistributions,
    recentMovies,
    statusGroups,
  ] = await Promise.all([
    prisma.movie.count(),
    prisma.movie.count({ where: { status: { in: [...reviewStatuses] } } }),
    prisma.movie.count({ where: { status: "FAILED" } }),
    prisma.targetSite.count({ where: { isActive: true } }),
    prisma.targetSite.count({ where: { isActive: true, healthStatus: "ERROR" } }),
    prisma.distribution.count({ where: { status: "FAILED" } }),
    prisma.movie.findMany({
      take: 8,
      orderBy: { updatedAt: "desc" },
      select: {
        id: true,
        title: true,
        slug: true,
        status: true,
        mainCategory: true,
        updatedAt: true,
      },
    }),
    prisma.movie.groupBy({ by: ["status"], _count: { _all: true } }),
  ]);

  const stageCounts: Record<string, number> = { draft: 0, progress: 0, done: 0, blocked: 0, archived: 0 };
  for (const g of statusGroups) {
    const stage = STAGE_OF[g.status];
    if (stage) stageCounts[stage] = (stageCounts[stage] ?? 0) + g._count._all;
  }
  const statusBuckets: StatusBucket[] = Object.entries(STAGE_META).map(([key, meta]) => ({
    key,
    label: meta.label,
    tone: meta.tone,
    count: stageCounts[key] ?? 0,
  }));

  return (
    <section>
      <div className="page-head">
        <h1>
          <span className="g">Backend Dashboard</span>
        </h1>
        <p>ภาพรวมระบบหลังบ้าน วิดีโอ การเผยแพร่ WordPress และ media player</p>
      </div>

      <div className="dash-grid">
        <Link className="dash-card" href="/admin/videos">
          <span className="dash-label">วิดีโอทั้งหมด</span>
          <strong>{totalMovies}</strong>
          <span>ดูและจัดการเนื้อหา</span>
        </Link>
        <Link className="dash-card" href="/admin/videos">
          <span className="dash-label">คิวตรวจ/อนุมัติ</span>
          <strong>{reviewQueue}</strong>
          <span>รายการที่ต้องดำเนินการ</span>
        </Link>
        <Link className="dash-card danger" href="/admin/videos">
          <span className="dash-label">วิดีโอล้มเหลว</span>
          <strong>{failedMovies}</strong>
          <span>ต้องตรวจและ retry</span>
        </Link>
        <Link className="dash-card" href="/admin/sites">
          <span className="dash-label">Domains Active</span>
          <strong>{activeSites}</strong>
          <span>{unhealthySites} domain มีปัญหา</span>
        </Link>
        <Link className="dash-card" href="/admin/player">
          <span className="dash-label">AURUM Player</span>
          <strong>ON</strong>
          <span>ตั้งค่า controller สำหรับ Bunny/native player</span>
        </Link>
        <Link className="dash-card danger" href="/admin/videos">
          <span className="dash-label">Distribution Failed</span>
          <strong>{failedDistributions}</strong>
          <span>งานเผยแพร่ที่ล้มเหลว</span>
        </Link>
      </div>

      <div className="panel">
        <div className="panel-head">
          <span className="n">1</span>
          <h3>ภาพรวม pipeline วิดีโอ</h3>
          <span className="sub">{totalMovies.toLocaleString("th-TH")} เรื่องทั้งหมด</span>
        </div>
        <StatusBreakdownBar buckets={statusBuckets} />
      </div>

      <div className="panel">
        <div className="panel-head">
          <span className="n">2</span>
          <h3>อัปเดตล่าสุด</h3>
          <Link className="sub" href="/admin/videos">
            ไปหน้าวิดีโอทั้งหมด
          </Link>
        </div>

        <table className="dtable">
          <thead>
            <tr>
              <th>วิดีโอ</th>
              <th>หมวดหมู่</th>
              <th>สถานะ</th>
              <th>อัปเดต</th>
            </tr>
          </thead>
          <tbody>
            {recentMovies.length === 0 ? (
              <tr>
                <td colSpan={4}>ยังไม่มีวิดีโอในระบบ</td>
              </tr>
            ) : (
              recentMovies.map((movie) => (
                <tr key={movie.id}>
                  <td>
                    <Link href={`/admin/videos/${movie.id}/edit`}>{movie.title}</Link>
                  </td>
                  <td>{movie.mainCategory ?? "-"}</td>
                  <td>
                    <span className={`badge ${badgeClass(movie.status)}`}>{statusLabels[movie.status] ?? movie.status}</span>
                  </td>
                  <td>{new Intl.DateTimeFormat("th-TH", { dateStyle: "medium", timeStyle: "short" }).format(movie.updatedAt)}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}
