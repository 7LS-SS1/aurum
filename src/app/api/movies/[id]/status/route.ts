import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { apiError, jsonOk } from "@/lib/api-response";
import { requireMinRole } from "@/lib/authz";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireMinRole("STAFF");
    const { id } = await params;

    const [movie, distributions, drafts] = await Promise.all([
      prisma.movie.findUnique({ where: { id }, select: { title: true } }),
      prisma.distribution.findMany({
        where: { movieId: id },
        include: { site: { select: { name: true } } },
        orderBy: { siteId: "asc" },
      }),
      prisma.movieSiteDraft.findMany({ where: { movieId: id }, select: { siteId: true, title: true } }),
    ]);
    const titleBySite = new Map(drafts.map(draft => [draft.siteId, draft.title]));

    return jsonOk(
      distributions.map((d) => ({
        siteId: d.siteId,
        siteName: d.site.name,
        title: titleBySite.get(d.siteId) || movie?.title || "",
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
