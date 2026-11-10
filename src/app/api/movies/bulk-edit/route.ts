import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireMinRole } from "@/lib/authz";
import { apiError, ApiError, jsonOk } from "@/lib/api-response";
import { invalidatePublicMovieCaches } from "@/lib/cache";
import { bulkTaxonomySchema, mergeTaxonomy } from "@/lib/bulk-taxonomy";
export async function POST(req: NextRequest) {
  try {
    const actor = await requireMinRole("STAFF");
    const input = bulkTaxonomySchema.parse(await req.json());
    const ids = [...new Set(input.ids)];
    await prisma.$transaction(async (tx) => {
      const movies = await tx.movie.findMany({ where: { id: { in: ids } }, include: { tags: true } });
      if (movies.length !== ids.length) throw new ApiError("movie_not_found", 404);
      if (movies.some(m => m.status === "PUBLISHING")) throw new ApiError("cannot_edit_while_publishing", 409);
      for (const movie of movies) {
        const categories = input.categories === undefined ? undefined : mergeTaxonomy(movie.categories, input.categories, input.mode);
        const tags = input.tags === undefined ? undefined : mergeTaxonomy(movie.tags.map(t => t.name), input.tags, input.mode);
        await tx.movie.update({ where: { id: movie.id }, data: {
          ...(input.mainCategory !== undefined ? { mainCategory: input.mainCategory } : {}),
          ...(categories !== undefined ? { categories } : {}),
          ...(tags !== undefined ? { tags: { set: [], connectOrCreate: tags.map(name => ({ where: { name }, create: { name } })) } } : {}),
        } });
      }
      await tx.auditLog.create({ data: { actorId: actor.id, actorRole: actor.role, action: "bulk_edit_taxonomy", resourceType: "movie", metadata: input } });
    }, { isolationLevel: "Serializable", timeout: 20000 });
    await invalidatePublicMovieCaches();
    return jsonOk({ updated: ids.length });
  } catch (error) { return apiError(error); }
}
