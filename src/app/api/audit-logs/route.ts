import { NextRequest } from "next/server";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { apiError, jsonOk } from "@/lib/api-response";
import { requireAdmin } from "@/lib/authz";

export async function GET(req: NextRequest) {
  try {
    await requireAdmin();

    const { searchParams } = req.nextUrl;
    const take = Math.min(Number(searchParams.get("take") ?? 50), 200);
    const cursor = searchParams.get("cursor") ?? undefined;

    const resourceType = searchParams.get("resourceType");
    const actorId = searchParams.get("actorId");
    const action = searchParams.get("action");
    const dateFrom = searchParams.get("dateFrom");
    const dateTo = searchParams.get("dateTo");

    const where: Prisma.AuditLogWhereInput = {
      ...(resourceType ? { resourceType } : {}),
      ...(actorId ? { actorId } : {}),
      ...(action ? { action } : {}),
      ...(dateFrom || dateTo
        ? {
            createdAt: {
              ...(dateFrom ? { gte: new Date(dateFrom) } : {}),
              ...(dateTo ? { lte: new Date(dateTo) } : {}),
            },
          }
        : {}),
    };

    const logs = await prisma.auditLog.findMany({
      where,
      take,
      ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
      orderBy: { createdAt: "desc" },
      include: { actor: { select: { id: true, name: true, email: true } } },
    });

    return jsonOk({ logs, nextCursor: logs.at(-1)?.id ?? null });
  } catch (err) {
    return apiError(err);
  }
}
