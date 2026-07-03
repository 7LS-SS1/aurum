import { NextRequest } from "next/server";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { encrypt } from "@/lib/crypto";
import { updatePlayerConfigSchema } from "@/lib/validation";
import { apiError, jsonOk, ApiError } from "@/lib/api-response";
import { requireMinRole, requireRole } from "@/lib/authz";
import { logAudit } from "@/lib/audit";

const PLAYER_PUBLIC_SELECT = {
  id: true,
  provider: true,
  name: true,
  playerId: true,
  libraryUrl: true,
  defaultPosterMode: true,
  isDefault: true,
  isActive: true,
  extraConfig: true,
  createdAt: true,
  updatedAt: true,
} as const;

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const actor = await requireMinRole("MANAGER");
    const { id } = await params;
    const input = updatePlayerConfigSchema.parse(await req.json());

    const existing = await prisma.playerConfig.findUnique({ where: { id } });
    if (!existing) throw new ApiError("player_config_not_found", 404);

    const keyEnc = input.apiKey ? encrypt(input.apiKey) : null;
    const secretEnc = input.apiSecret ? encrypt(input.apiSecret) : null;

    const mergedExtraConfig =
      input.extraConfig !== undefined || input.siteId !== undefined
        ? {
            ...((existing.extraConfig as Record<string, unknown>) ?? {}),
            ...(input.extraConfig ?? {}),
            ...(input.siteId ? { siteId: input.siteId } : {}),
          }
        : undefined;

    const config = await prisma.$transaction(async (tx) => {
      if (input.isDefault) {
        await tx.playerConfig.updateMany({ where: { isDefault: true, id: { not: id } }, data: { isDefault: false } });
      }
      return tx.playerConfig.update({
        where: { id },
        data: {
          provider: input.provider,
          name: input.name,
          playerId: input.playerId,
          libraryUrl: input.libraryUrl,
          defaultPosterMode: input.defaultPosterMode,
          isDefault: input.isDefault,
          isActive: input.isActive,
          extraConfig: mergedExtraConfig as Prisma.InputJsonValue | undefined,
          ...(keyEnc ? { apiKeyEnc: keyEnc.ciphertext, apiKeyIv: keyEnc.iv, apiKeyTag: keyEnc.tag } : {}),
          ...(secretEnc ? { apiSecretEnc: secretEnc.ciphertext, apiSecretIv: secretEnc.iv, apiSecretTag: secretEnc.tag } : {}),
        },
        select: PLAYER_PUBLIC_SELECT,
      });
    });

    await logAudit({ actor, action: "update_player_config", resourceType: "player_config", resourceId: id });

    return jsonOk(config);
  } catch (err) {
    return apiError(err);
  }
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const actor = await requireRole("HEAD");
    const { id } = await params;
    const existing = await prisma.playerConfig.findUnique({ where: { id } });
    if (!existing) throw new ApiError("player_config_not_found", 404);

    await prisma.playerConfig.delete({ where: { id } });

    await logAudit({ actor, action: "delete_player_config", resourceType: "player_config", resourceId: id, metadata: { name: existing.name } });

    return jsonOk({ ok: true });
  } catch (err) {
    return apiError(err);
  }
}
