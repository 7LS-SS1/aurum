import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";

function databaseErrorCode(error: object): string | undefined {
  if ("code" in error && typeof error.code === "string") return error.code;
  if ("errorCode" in error && typeof error.errorCode === "string") return error.errorCode;
  return undefined;
}

export function isTransientDatabaseDisconnect(error: unknown): boolean {
  if (!(error instanceof Prisma.PrismaClientKnownRequestError || error instanceof Prisma.PrismaClientInitializationError)) return false;
  const code = databaseErrorCode(error);
  return code === "P1001" || code === "P1017";
}

let reconnectInFlight: Promise<void> | null = null;

async function reconnect(): Promise<void> {
  if (!reconnectInFlight) {
    reconnectInFlight = (async () => {
      await prisma.$disconnect();
      await prisma.$connect();
    })().finally(() => {
      reconnectInFlight = null;
    });
  }
  return reconnectInFlight;
}

/** Retry only a single read, whose result cannot have committed a write. */
export async function withPrismaReadReconnect<T>(read: () => Promise<T>): Promise<T> {
  try {
    return await read();
  } catch (error) {
    if (!isTransientDatabaseDisconnect(error)) throw error;
    await reconnect();
    return read();
  }
}

/** A transaction may be repeated only if its callback never began. */
export async function withPrismaTransactionStartReconnect<T>(
  transaction: (markStarted: () => void) => Promise<T>,
): Promise<T> {
  let started = false;
  try {
    return await transaction(() => { started = true; });
  } catch (error) {
    if (started || !isTransientDatabaseDisconnect(error)) throw error;
    await reconnect();
    return transaction(() => { started = true; });
  }
}
