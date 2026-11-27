import { randomBytes } from "node:crypto";
import { z } from "zod";
import { ApiError } from "@/lib/api-response";
import { prisma } from "@/lib/prisma";
import { hashPassword, hashToken, lockViewerCredentials, verifyPassword } from "@/lib/viewer-auth";

export const MAX_PASSWORD_BYTES = 72;
export const changePasswordInput = z.object({
  currentPassword: z.string().min(1).max(MAX_PASSWORD_BYTES),
  newPassword: z.string().min(12).max(MAX_PASSWORD_BYTES),
}).strict();

export async function changeViewerPassword(viewerId: string, currentToken: string, input: z.infer<typeof changePasswordInput>) {
  if (Buffer.byteLength(input.newPassword, "utf8") > MAX_PASSWORD_BYTES) throw new ApiError("password_too_long", 422);

  const viewer = await prisma.viewer.findUnique({ where: { id: viewerId }, select: { passwordHash: true, suspended: true } });
  if (!viewer || viewer.suspended) throw new ApiError("unauthorized", 401);
  if (!viewer.passwordHash) throw new ApiError("password_not_configured", 409);
  const previousHash = viewer.passwordHash;

  if (!await verifyPassword(input.currentPassword, previousHash)) throw new ApiError("invalid_current_password", 400);
  if (input.newPassword === input.currentPassword) throw new ApiError("password_unchanged", 422);

  const passwordHash = await hashPassword(input.newPassword);
  const token = randomBytes(32).toString("base64url");
  const currentTokenHash = hashToken(currentToken);

  return prisma.$transaction(async (tx) => {
    await lockViewerCredentials(tx, viewerId);
    const now = new Date();
    const session = await tx.viewerSession.findUnique({ where: { tokenHash: currentTokenHash }, select: { id: true, viewerId: true, expiresAt: true } });
    if (session?.viewerId !== viewerId || session.expiresAt <= now) throw new ApiError("unauthorized", 401);

    const changed = await tx.viewer.updateMany({ where: { id: viewerId, suspended: false, passwordHash: previousHash }, data: { passwordHash } });
    if (!changed.count) throw new ApiError("credentials_changed", 409);
    const rotated = await tx.viewerSession.updateMany({ where: { id: session.id, viewerId, tokenHash: currentTokenHash, expiresAt: { gt: now } }, data: { tokenHash: hashToken(token) } });
    if (!rotated.count) throw new ApiError("unauthorized", 401);
    await tx.viewerSession.deleteMany({ where: { viewerId, id: { not: session.id } } });
    await tx.accountAction.updateMany({ where: { viewerId, purpose: "reset", consumedAt: null }, data: { consumedAt: now } });
    await tx.auditLog.create({ data: { actorRole: "SYSTEM", action: "member_password_changed", resourceType: "viewer", resourceId: viewerId } });

    return { token, expiresAt: session.expiresAt };
  });
}
