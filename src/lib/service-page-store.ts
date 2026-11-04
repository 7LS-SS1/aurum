import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { defaultServicePage, servicePageSchema, type ServicePageConfig } from "./service-page-config";
import { ApiError } from "./api-response";
import type { Actor } from "./authz";

export async function getServicePage() {
  try {
    const row = await prisma.servicePageConfig.findUnique({ where: { id: "default" } });
    return { config: row ? servicePageSchema.parse(row.config) : defaultServicePage, revision: row?.revision ?? 0, ready: true };
  } catch (error) {
    // A pre-migration deployment retains the existing public page. Other failures
    // must not silently replace saved commercial terms with default prices.
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2021") {
      return { config: defaultServicePage, revision: 0, ready: false };
    }
    throw error;
  }
}

export async function saveServicePage(config: ServicePageConfig, revision: number, actor: Actor) {
  try {
    return await prisma.$transaction(async tx => {
      const previous = await tx.servicePageConfig.findUnique({ where: { id: "default" } });
      if ((previous?.revision ?? 0) !== revision) throw new ApiError("service_page_conflict", 409);
      if (revision === 0) {
        await tx.servicePageConfig.create({ data: { id: "default", config, revision: 1 } });
      } else {
        const result = await tx.servicePageConfig.updateMany({ where: { id: "default", revision }, data: { config, revision: { increment: 1 } } });
        if (result.count !== 1) throw new ApiError("service_page_conflict", 409);
      }
      await tx.auditLog.create({ data: {
        actorId: actor.id, actorRole: actor.role, action: "update_service_page", resourceType: "service_page", resourceId: "default",
        metadata: { revision: revision + 1, previousConfig: previous?.config ?? defaultServicePage, config } as Prisma.InputJsonValue,
      } });
      return { config, revision: revision + 1, ready: true };
    }, { maxWait: 10_000, timeout: 10_000 });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      if (error.code === "P2002") throw new ApiError("service_page_conflict", 409);
      if (error.code === "P2021") throw new ApiError("service_page_migration_required", 503);
    }
    throw error;
  }
}
