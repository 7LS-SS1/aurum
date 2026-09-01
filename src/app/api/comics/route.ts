import { NextRequest } from "next/server";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { createComicSchema } from "@/lib/validation";
import { apiError, jsonOk, ApiError } from "@/lib/api-response";
import { requireMinRole } from "@/lib/authz";
import { logAudit } from "@/lib/audit";
import { rateLimit } from "@/lib/rate-limit";

const COMIC_TYPES = ["MANGA", "DOUJIN"] as const;
const COMIC_STATUSES = ["ONGOING", "COMPLETED", "HIATUS"] as const;

function slugifyTitle(title: string) {
  const slug = title
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);

  return slug || `comic-${Date.now().toString(36)}`;
}

async function getUniqueComicSlug(title: string, requestedSlug?: string) {
  const base = requestedSlug?.trim() || slugifyTitle(title);
  let slug = base;
  let suffix = 2;

  while (await prisma.comic.findUnique({ where: { slug }, select: { id: true } })) {
    slug = `${base}-${suffix}`;
    suffix += 1;
  }

  return slug;
}

export async function GET(req: NextRequest) {
  try {
    await requireMinRole("STAFF");

    const { searchParams } = req.nextUrl;
    const requestedTake = Number(searchParams.get("take") ?? 20);
    const take = Number.isFinite(requestedTake) ? Math.min(Math.max(1, requestedTake), 100) : 20;
    const requestedPage = Math.max(1, Number(searchParams.get("page") ?? 1) || 1);

    const comicType = searchParams.get("comicType");
    const status = searchParams.get("status");
    const q = searchParams.get("q")?.trim();

    const where: Prisma.ComicWhereInput = {
      ...(comicType && (COMIC_TYPES as readonly string[]).includes(comicType) ? { comicType: comicType as (typeof COMIC_TYPES)[number] } : {}),
      ...(status && (COMIC_STATUSES as readonly string[]).includes(status) ? { status: status as (typeof COMIC_STATUSES)[number] } : {}),
      ...(q ? { OR: [{ title: { contains: q, mode: "insensitive" } }, { slug: { contains: q, mode: "insensitive" } }] } : {}),
    };

    const total = await prisma.comic.count({ where });
    const totalPages = Math.max(1, Math.ceil(total / take));
    const page = Math.min(requestedPage, totalPages);

    const comics = await prisma.comic.findMany({
      where,
      take,
      skip: (page - 1) * take,
      orderBy: { createdAt: "desc" },
      include: { series: { select: { id: true, title: true } }, _count: { select: { chapters: true } } },
    });

    return jsonOk({ comics, pagination: { page, totalPages, total, pageSize: take } });
  } catch (err) {
    return apiError(err);
  }
}

export async function POST(req: NextRequest) {
  try {
    const actor = await requireMinRole("STAFF");

    const { success } = await rateLimit(`comics:create:${actor.id}`, { limit: 30, windowMs: 60_000 });
    if (!success) throw new ApiError("too_many_requests", 429);

    const input = createComicSchema.parse(await req.json());
    const slug = await getUniqueComicSlug(input.title, input.slug);

    const comic = await prisma.comic.create({
      data: {
        title: input.title,
        slug,
        altTitles: input.altTitles,
        description: input.description,
        authorName: input.authorName,
        comicType: input.comicType,
        status: input.status,
        isOneShot: input.isOneShot,
        coverImageUrl: input.coverImageUrl,
        coverObjectKey: input.coverObjectKey,
        seriesId: input.seriesId ?? undefined,
        categories: { connect: input.categoryIds.map((id) => ({ id })) },
        tags: { connectOrCreate: input.tags.map((name) => ({ where: { name }, create: { name } })) },
        createdById: actor.id,
      },
    });

    await logAudit({ actor, action: "create_comic", resourceType: "comic", resourceId: comic.id, metadata: { title: comic.title } });

    return jsonOk(comic, 201);
  } catch (err) {
    return apiError(err);
  }
}
