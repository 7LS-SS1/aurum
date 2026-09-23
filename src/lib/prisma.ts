import { PrismaClient } from "@prisma/client";

import { databaseUrlWithPoolDefaults } from "@/lib/database-url";

/**
 * Keep one Prisma client per Node.js process. The explicit pool defaults avoid
 * sizing the pool from every CPU visible on a large Docker host.
 */
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

const datasourceUrl = databaseUrlWithPoolDefaults(process.env.DATABASE_URL, {
  connectionLimit: process.env.PRISMA_CONNECTION_LIMIT,
  poolTimeoutSeconds: process.env.PRISMA_POOL_TIMEOUT_SECONDS,
});

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    ...(datasourceUrl ? { datasources: { db: { url: datasourceUrl } } } : {}),
    log: process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"],
  });

globalForPrisma.prisma = prisma;
