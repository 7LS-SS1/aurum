import { prisma } from "@/lib/prisma";
import { AutoDownloadManager } from "@/components/admin/AutoDownloadManager";

export const dynamic = "force-dynamic";

export default async function AutoDownloadPage() {
  const [mainCategories, jobs] = await Promise.all([
    prisma.mainCategory.findMany({ select: { name: true }, orderBy: { name: "asc" } }),
    prisma.autoDownloadJob.findMany({ orderBy: { createdAt: "desc" }, take: 200 }),
  ]);
  return <AutoDownloadManager
    mainCategories={mainCategories.map((item) => item.name)}
    initialJobs={jobs.map((job) => ({ ...job, bytes: job.bytes === null ? null : Number(job.bytes), createdAt: job.createdAt.toISOString() }))}
  />;
}
