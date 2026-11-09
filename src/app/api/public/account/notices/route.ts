import { NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireViewerFromRequest } from "@/lib/viewer-auth";
import { ApiError, apiError, jsonOk } from "@/lib/api-response";
import { readServicePageBody, servicePageOriginAllowed } from "@/lib/service-page-request";
export async function GET(req: NextRequest) {
  try {
    const viewer = await requireViewerFromRequest(req);
    const cursor = z.string().uuid().optional().parse(req.nextUrl.searchParams.get("cursor") || undefined);
    const rows = await prisma.customerNotice.findMany({ where: { viewerId: viewer.id }, take: 31, orderBy: [{ createdAt: "desc" }, { id: "desc" }], ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}) });
    return jsonOk({ items: rows.slice(0,30), nextCursor: rows.length > 30 ? rows[29]!.id : null, unread: await prisma.customerNotice.count({ where: { viewerId: viewer.id, readAt: null } }) }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) { return apiError(error); }
}
export async function PATCH(req: NextRequest) {
  try {
    if (!servicePageOriginAllowed(req.headers.get("origin"), req.url)) throw new ApiError("invalid_origin",403);
    const viewer = await requireViewerFromRequest(req);
    const input = z.object({ id: z.string().uuid().optional() }).strict().parse(await readServicePageBody(req));
    await prisma.customerNotice.updateMany({ where: { viewerId: viewer.id, readAt: null, ...(input.id ? { id: input.id } : {}) }, data: { readAt: new Date() } });
    return jsonOk({ ok: true });
  } catch (error) { return apiError(error); }
}
