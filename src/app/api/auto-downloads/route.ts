import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { apiError, jsonOk } from "@/lib/api-response";
import { requireMinRole } from "@/lib/authz";
import { logAudit } from "@/lib/audit";
import { enqueueDownloads, enqueueSchema } from "@/lib/auto-download";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  try {
    await requireMinRole("STAFF");
    const status = req.nextUrl.searchParams.get("status");
    const jobs = await prisma.autoDownloadJob.findMany({
      where: status && ["QUEUED", "DOWNLOADING", "DONE", "FAILED"].includes(status) ? { status: status as "QUEUED" } : {},
      orderBy: { createdAt: "desc" },
      take: 200,
    });
    return jsonOk(jobs.map((job) => ({ ...job, bytes: job.bytes === null ? null : Number(job.bytes) })));
  } catch (error) { return apiError(error); }
}

export async function POST(req: NextRequest) {
  try {
    const actor = await requireMinRole("STAFF");
    const input = enqueueSchema.parse(await req.json());
    const ids = await enqueueDownloads(input, actor.id);
    await logAudit({ actor, action: "auto_download_enqueue", resourceType: "auto_download", resourceId: ids[0], metadata: { count: ids.length } });
    return jsonOk({ ids }, 201);
  } catch (error) { return apiError(error); }
}
