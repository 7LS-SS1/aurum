import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import type { Actor } from "@/lib/authz";

export interface AuditEntry {
  actor: Actor;
  action: string;
  resourceType: string;
  resourceId?: string;
  metadata?: Record<string, unknown>;
}

/**
 * Best-effort audit trail write. Never throws — a logging hiccup must not
 * block the primary mutation it's recording (same pragmatic error handling
 * as the thumbnail-upload fallback in distributor.ts).
 */
export async function logAudit({ actor, action, resourceType, resourceId, metadata }: AuditEntry): Promise<void> {
  try {
    await prisma.auditLog.create({
      data: {
        actorId: actor.id,
        actorRole: actor.role,
        action,
        resourceType,
        resourceId,
        metadata: (metadata ?? {}) as Prisma.InputJsonValue,
      },
    });
  } catch (err) {
    console.error("logAudit failed", { action, resourceType, resourceId }, err);
  }
}
