import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { createComicSeriesSchema } from "@/lib/validation";
import { apiError, jsonOk, ApiError } from "@/lib/api-response";
import { requireMinRole } from "@/lib/authz";
import { logAudit } from "@/lib/audit";
import { rateLimit } from "@/lib/rate-limit";

function slugifyTitle(title: string) {
  const slug = title
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);

  return slug || `series-${Date.now().toString(36)}`;
}

async function getUniqueSeriesSlug(title: string, requestedSlug?: string) {
  const base = requestedSlug?.trim() || slugifyTitle(title);
  let slug = base;
  let suffix = 2;

  while (await prisma.comicSeries.findUnique({ where: { slug }, select: { id: true } })) {
    slug = `${base}-${suffix}`;
    suffix += 1;
  }

  return slug;
}

export async function GET() {
  try {
    await requireMinRole("STAFF");
    const series = await prisma.comicSeries.findMany({ orderBy: { title: "asc" } });
    return jsonOk(series);
  } catch (err) {
    return apiError(err);
  }
}

export async function POST(req: NextRequest) {
  try {
    const actor = await requireMinRole("STAFF");

    const { success } = await rateLimit(`comic-series:create:${actor.id}`, { limit: 20, windowMs: 60_000 });
    if (!success) throw new ApiError("too_many_requests", 429);

    const input = createComicSeriesSchema.parse(await req.json());
    const slug = await getUniqueSeriesSlug(input.title, input.slug);

    const series = await prisma.comicSeries.create({ data: { title: input.title, slug, description: input.description } });
    await logAudit({ actor, action: "create_comic_series", resourceType: "comic_series", resourceId: series.id, metadata: { title: series.title } });

    return jsonOk(series, 201);
  } catch (err) {
    return apiError(err);
  }
}
