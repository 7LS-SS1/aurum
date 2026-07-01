import { PrismaClient } from "@prisma/client";

/**
 * Reuse the client across hot-reloads in dev so we don't exhaust Neon's
 * connection pool by creating a new PrismaClient on every module reload.
 */
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"],
  });

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
