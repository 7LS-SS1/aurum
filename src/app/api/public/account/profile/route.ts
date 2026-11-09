import { NextRequest } from "next/server";
import { z } from "zod";
import { requireViewerFromRequest } from "@/lib/viewer-auth";
import { prisma } from "@/lib/prisma";
import { apiError, jsonOk, ApiError } from "@/lib/api-response";
import { readServicePageBody, servicePageOriginAllowed } from "@/lib/service-page-request";
export async function PATCH(req: NextRequest) {
  try {
    const viewer = await requireViewerFromRequest(req);
    if (!servicePageOriginAllowed(req.headers.get("origin"), req.url)) throw new ApiError("invalid_origin", 403);
    const data = z.object({ displayName: z.string().trim().min(2).max(80) }).strict().parse(await readServicePageBody(req));
    return jsonOk(await prisma.viewer.update({ where: { id: viewer.id }, data, select: { displayName: true } }), { headers: { "Cache-Control": "no-store" } });
  } catch (error) { return apiError(error); }
}
