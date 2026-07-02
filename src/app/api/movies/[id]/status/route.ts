import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { apiError, jsonOk } from "@/lib/api-response";
import { requireMinRole } from "@/lib/authz";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireMinRole("STAFF");
    const { id } = await params;

    const distributions = await prisma.distribution.findMany({
      where: { movieId: id },
      include: { site: { select: { name: true } } },
      orderBy: { siteId: "asc" },
    });

    return jsonOk(
      distributions.map((d) => ({
        siteId: d.siteId,
        siteName: d.site.name,
        status: d.status,
        remotePostId: d.remotePostId,
        remotePostUrl: d.remotePostUrl,
        errorMessage: d.errorMessage,
        attempts: d.attempts,
        distributedAt: d.distributedAt,
      })),
    );
  } catch (err) {
    return apiError(err);
  }
}
