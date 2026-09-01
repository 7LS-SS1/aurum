import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { createComicTagSchema } from "@/lib/validation";
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

    const total = await prisma.comicTag.count({ where });
    const totalPages = Math.max(1, Math.ceil(total / take));
    const page = Math.min(requestedPage, totalPages);

    const rows = await prisma.comicTag.findMany({
      where,
      take,
      skip: (page - 1) * take,
      orderBy: { name: "asc" },
      include: { _count: { select: { comics: true } } },
    });
    const tags = rows.map((t) => ({ id: t.id, name: t.name, createdAt: t.createdAt, comicCount: t._count.comics }));

    return jsonOk({ tags, pagination: { page, totalPages, total, pageSize: take } });
  } catch (err) {
    return apiError(err);
  }
}

/** `name` may be one tag or several comma-separated names, same bulk-add convention as POST /api/tags. */
export async function POST(req: NextRequest) {
  try {
    const actor = await requireMinRole("STAFF");

    const { success } = await rateLimit(`comic-tags:create:${actor.id}`, { limit: 20, windowMs: 60_000 });
    if (!success) throw new ApiError("too_many_requests", 429);

    const input = createComicTagSchema.parse(await req.json());
    const names = [...new Set(input.name.split(",").map((n) => n.trim()).filter(Boolean))].slice(0, 50);
    if (!names.length) throw new ApiError("no_valid_tag_names", 400);

    const tags = await Promise.all(
      names.map(async (name) => {
        const existing = await prisma.comicTag.findFirst({ where: { name: { equals: name, mode: "insensitive" } } });
        return existing ?? prisma.comicTag.create({ data: { name } });
      }),
    );

    await logAudit({ actor, action: "create_comic_tags", resourceType: "comic_tag", metadata: { names } });

    return jsonOk(tags, 201);
  } catch (err) {
    return apiError(err);
  }
}
