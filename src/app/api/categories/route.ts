import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { createCategorySchema } from "@/lib/validation";
import { apiError, jsonOk, ApiError } from "@/lib/api-response";
import { requireMinRole } from "@/lib/authz";
import { logAudit } from "@/lib/audit";
import { rateLimit } from "@/lib/rate-limit";

export async function GET() {
  try {
    await requireMinRole("STAFF");
    const categories = await prisma.category.findMany({ orderBy: { name: "asc" } });
    return jsonOk(categories);
  } catch (err) {
    return apiError(err);
  }
}

/** Same-name requests return the existing row instead of erroring — the upload wizard's "add category" toggle can be pressed more than once without surfacing a conflict. */
export async function POST(req: NextRequest) {
  try {
    const actor = await requireMinRole("STAFF");

    const { success } = await rateLimit(`categories:create:${actor.id}`, { limit: 20, windowMs: 60_000 });
    if (!success) throw new ApiError("too_many_requests", 429);

    const input = createCategorySchema.parse(await req.json());

    const existing = await prisma.category.findFirst({ where: { name: { equals: input.name, mode: "insensitive" } } });
    if (existing) return jsonOk(existing);

    const category = await prisma.category.create({ data: { name: input.name } });
    await logAudit({ actor, action: "create_category", resourceType: "category", resourceId: category.id, metadata: { name: category.name } });

    return jsonOk(category, 201);
  } catch (err) {
    return apiError(err);
  }
}
