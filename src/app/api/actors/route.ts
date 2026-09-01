import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { createActorSchema } from "@/lib/validation";
import { apiError, jsonOk, ApiError } from "@/lib/api-response";
import { requireMinRole } from "@/lib/authz";
import { logAudit } from "@/lib/audit";
import { rateLimit } from "@/lib/rate-limit";

export async function GET(req: NextRequest) {
  try {
    await requireMinRole("STAFF");

    const { searchParams } = req.nextUrl;
    const requestedTake = Number(searchParams.get("take") ?? 20);
    const take = Number.isFinite(requestedTake) ? Math.min(Math.max(1, requestedTake), 100) : 20;
    const requestedPage = Math.max(1, Number(searchParams.get("page") ?? 1) || 1);
    const q = searchParams.get("q")?.trim();

    const where = q ? { name: { contains: q, mode: "insensitive" as const } } : {};

    const total = await prisma.actor.count({ where });
    const totalPages = Math.max(1, Math.ceil(total / take));
    const page = Math.min(requestedPage, totalPages);

    const actors = await prisma.actor.findMany({
      where,
      take,
      skip: (page - 1) * take,
      orderBy: { name: "asc" },
    });

    return jsonOk({ actors, pagination: { page, totalPages, total, pageSize: take } });
  } catch (err) {
    return apiError(err);
  }
}

export async function POST(req: NextRequest) {
  try {
    const actor = await requireMinRole("STAFF");

    const { success } = await rateLimit(`actors:create:${actor.id}`, { limit: 20, windowMs: 60_000 });
    if (!success) throw new ApiError("too_many_requests", 429);

    const input = createActorSchema.parse(await req.json());
    const created = await prisma.actor.create({ data: input });

    await logAudit({ actor, action: "create_actor", resourceType: "actor", resourceId: created.id, metadata: { name: created.name } });

    return jsonOk(created, 201);
  } catch (err) {
    return apiError(err);
  }
}
