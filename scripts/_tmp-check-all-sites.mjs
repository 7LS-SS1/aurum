import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();

const eligibleCount = await prisma.movie.count({ where: { status: { in: ["APPROVED", "DONE", "PARTIAL"] } } });
console.log("Total eligible movies in AURUM:", eligibleCount);

const sites = await prisma.targetSite.findMany({ where: { isActive: true }, select: { id: true, name: true } });
for (const site of sites) {
  const successCount = await prisma.distribution.count({ where: { siteId: site.id, status: "SUCCESS" } });
  const activeJob = await prisma.siteSyncJob.findFirst({ where: { siteId: site.id, status: { in: ["QUEUED", "SCANNING", "PROCESSING"] } } });
  console.log(site.name, { siteId: site.id, successDistributions: successCount, missing: eligibleCount - successCount, activeJob: activeJob?.id ?? null });
}

await prisma.$disconnect();
