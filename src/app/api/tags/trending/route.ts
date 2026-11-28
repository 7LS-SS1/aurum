import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { apiError, jsonOk } from "@/lib/api-response";
import { requireMinRole } from "@/lib/authz";
import { matchTagsToTitle, trendingTags } from "@/lib/tag-trends";

/** Trending tags (last N days vs the N days before) plus tags matching a draft title. */
export async function GET(req: NextRequest) {
  try {
    await requireMinRole("STAFF");
    const params = req.nextUrl.searchParams;
    const days = [1, 7, 30].includes(Number(params.get("days"))) ? Number(params.get("days")) : 7;
    const title = (params.get("title") ?? "").slice(0, 500);
    const [trending, all] = await Promise.all([
      trendingTags(days, 20),
      title ? prisma.tag.findMany({ select: { name: true }, orderBy: { movies: { _count: "desc" } }, take: 2000 }) : Promise.resolve([]),
    ]);
    return jsonOk({ days, trending, suggested: matchTagsToTitle(title, all.map((row) => row.name)) }, { headers: { "Cache-Control": "private, max-age=60" } });
  } catch (error) { return apiError(error); }
}
