import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { createMainCategorySchema } from "@/lib/validation";
import { apiError, jsonOk, ApiError } from "@/lib/api-response";
import { requireMinRole } from "@/lib/authz";
import { logAudit } from "@/lib/audit";
import { rateLimit } from "@/lib/rate-limit";

export async function GET() {
  try {
    await requireMinRole("STAFF");
    const mainCategories = await prisma.mainCategory.findMany({ orderBy: { name: "asc" } });
    return jsonOk(mainCategories);
  } catch (err) {
    return apiError(err);
  }
}

/** Same-name requests return the existing row instead of erroring — mirrors POST /api/categories. */
export async function POST(req: NextRequest) {
  try {
    const actor = await requireMinRole("STAFF");

    const { success } = await rateLimit(`main-categories:create:${actor.id}`, { limit: 20, windowMs: 60_000 });
    if (!success) throw new ApiError("too_many_requests", 429);

    const input = createMainCategorySchema.parse(await req.json());

    const existing = await prisma.mainCategory.findFirst({ where: { name: { equals: input.name, mode: "insensitive" } } });
    if (existing) return jsonOk(existing);

    const mainCategory = await prisma.mainCategory.create({ data: { name: input.name } });
    await logAudit({ actor, action: "create_main_category", resourceType: "main_category", resourceId: mainCategory.id, metadata: { name: mainCategory.name } });

    return jsonOk(mainCategory, 201);
  } catch (err) {
    return apiError(err);
  }
}
