import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { defaultAdsPage, adsPageSchema, type AdsPageConfig } from "./ads-page-config";
import { ApiError } from "./api-response";
import type { Actor } from "./authz";
import { reservedStatuses } from "./ads-inventory-status";

export async function getAdsPage() {
  try {
    const row = await prisma.servicePageConfig.findUnique({ where: { id: "ads-banner" } });
    return { config: row ? adsPageSchema.parse(row.config) : defaultAdsPage, revision: row?.revision ?? 0, ready: true };
  } catch (error) {
    // A pre-migration deployment retains the existing public page. Other failures
    // must not silently replace saved commercial terms with default prices.
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2021") {
      return { config: defaultAdsPage, revision: 0, ready: false };
    }
    throw error;
  }
}

export async function saveAdsPage(config: AdsPageConfig, revision: number, actor: Actor) {
  try {
    return await prisma.$transaction(async tx => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(73421, 1)`;
      const previous = await tx.servicePageConfig.findUnique({ where: { id: "ads-banner" } });
      if ((previous?.revision ?? 0) !== revision) throw new ApiError("ads_page_conflict", 409);
      const oldCounts = previous ? adsPageSchema.parse(previous.config).inventoryCounts : defaultAdsPage.inventoryCounts;
      if (JSON.stringify(oldCounts) !== JSON.stringify(config.inventoryCounts)) {
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(73421, 1)`;
        const occupied = await tx.adsOrder.count({ where: { status: { in: reservedStatuses } } });
        if (occupied) throw new ApiError("inventory_in_use", 409);
      }
      if (revision === 0) {
        await tx.servicePageConfig.create({ data: { id: "ads-banner", config, revision: 1 } });
      } else {
        const result = await tx.servicePageConfig.updateMany({ where: { id: "ads-banner", revision }, data: { config, revision: { increment: 1 } } });
        if (result.count !== 1) throw new ApiError("ads_page_conflict", 409);
      }
      await tx.auditLog.create({ data: {
        actorId: actor.id, actorRole: actor.role, action: "update_ads_page", resourceType: "ads_page", resourceId: "ads-banner",
        metadata: { revision: revision + 1, previousConfig: previous?.config ?? defaultAdsPage, config } as Prisma.InputJsonValue,
      } });
      return { config, revision: revision + 1, ready: true };
    }, { maxWait: 10_000, timeout: 10_000 });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      if (error.code === "P2002") throw new ApiError("ads_page_conflict", 409);
      if (error.code === "P2021") throw new ApiError("ads_page_migration_required", 503);
    }
    throw error;
  }
}
