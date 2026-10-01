import { requireMinRole } from "@/lib/authz";
import { prisma } from "@/lib/prisma";
import { listContentGenerationJobs } from "@/lib/content-generation/job-service";
import { ContentGenerationDashboard } from "@/components/admin/ContentGenerationDashboard";

export default async function ContentGenerationPage() {
  await requireMinRole("MANAGER");
  const [movies, sites, jobs] = await Promise.all([
    prisma.movie.findMany({
      where: { status: { not: "ARCHIVED" } },
      orderBy: { updatedAt: "desc" },
      take: 200,
      select: { id: true, title: true, mainCategory: true, thumbnailUrl: true, status: true, updatedAt: true },
    }),
    prisma.targetSite.findMany({
      where: { isActive: true },
      orderBy: { name: "asc" },
      select: { id: true, name: true, baseUrl: true, healthStatus: true },
    }),
    listContentGenerationJobs(30),
  ]);

  return (
    <section>
      <div className="page-head">
        <h1><span className="g">AI Content Queue</span></h1>
        <p>สร้างชื่อและคำบรรยายหลายวิดีโอแยกตามเว็บไซต์ ตรวจแก้และอนุมัติก่อนนำไปใช้กับ WordPress</p>
      </div>
      <ContentGenerationDashboard
        initialMovies={JSON.parse(JSON.stringify(movies))}
        initialSites={JSON.parse(JSON.stringify(sites))}
        initialJobs={JSON.parse(JSON.stringify(jobs))}
      />
    </section>
  );
}
