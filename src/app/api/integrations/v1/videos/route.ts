import { prisma } from "@/lib/prisma";
import { ApiError, apiError, jsonOk } from "@/lib/api-response";
import { rateLimit } from "@/lib/rate-limit";
import { ingestIdentity, readIngestBody, requireVideoIngestKey, videoIngestSchema } from "@/lib/video-ingest";

export const runtime = "nodejs";

export async function POST(req: Request) {
  try {
    requireVideoIngestKey(req);
    const limit = await rateLimit("video-ingest:v1", { limit: 60, windowMs: 60_000 });
    if (!limit.success) return jsonOk({ error: "too_many_requests" }, {
      status: 429, headers: { "Retry-After": String(Math.max(1, Math.ceil((limit.resetMs - Date.now()) / 1000))) },
    });
    const input = videoIngestSchema.parse(await readIngestBody(req));
    const { id, payloadHash } = ingestIdentity(input);
    const replay = async () => {
      const existing = await prisma.movie.findUnique({ where: { id } });
      if (!existing) return null;
      const meta = existing.extraMeta as { ingestPayloadHash?: string } | null;
      if (meta?.ingestPayloadHash !== payloadHash) throw new ApiError("external_id_conflict", 409);
      return jsonOk({ id: existing.id, slug: existing.slug, status: existing.status, replayed: true });
    };
    const previous = await replay();
    if (previous) return previous;
    try {
      const movie = await prisma.$transaction(async (tx) => {
        const sites = await tx.targetSite.findMany({ where: { isActive: true }, select: { id: true, mainCategories: true } });
        const targetSiteIds = sites.filter((site) => {
          const accepted = Array.isArray(site.mainCategories) ? site.mainCategories : [];
          return accepted.length === 0 || accepted.includes(input.mainCategory);
        }).map((site) => site.id);
        const { source, externalId, tags, ...data } = input;
        const created = await tx.movie.create({ data: {
          ...data, id, status: "DRAFT", targetSiteIds,
          tags: { connectOrCreate: tags.map((name) => ({ where: { name }, create: { name } })) },
          extraMeta: { ingestSource: source, ingestExternalId: externalId, ingestPayloadHash: payloadHash },
        } });
        await tx.auditLog.create({ data: {
          actorRole: "SYSTEM", action: "ingest_movie", resourceType: "movie", resourceId: id,
          metadata: { source, externalId },
        } });
        return created;
      });
      return jsonOk({ id: movie.id, slug: movie.slug, status: movie.status, replayed: false }, 201);
    } catch (error) {
      if ((error as { code?: string })?.code === "P2002") {
        const existing = await replay();
        if (existing) return existing;
        if (await prisma.movie.findUnique({ where: { slug: input.slug }, select: { id: true } })) {
          throw new ApiError("slug_conflict", 409);
        }
        // A simultaneous import may have created a shared tag. Retrying is safe.
        throw new ApiError("concurrent_import_retry", 503);
      }
      throw error;
    }
  } catch (error) { return apiError(error); }
}
