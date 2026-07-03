import { NextRequest } from "next/server";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { encrypt } from "@/lib/crypto";
import { createPlayerConfigSchema } from "@/lib/validation";
import { apiError, jsonOk, ApiError } from "@/lib/api-response";
import { requireMinRole } from "@/lib/authz";
import { logAudit } from "@/lib/audit";
import { rateLimit } from "@/lib/rate-limit";

// Fields intentionally excluded: apiKeyEnc/Iv/Tag, apiSecretEnc/Iv/Tag.
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

export async function GET() {
  try {
    await requireMinRole("STAFF");
    const configs = await prisma.playerConfig.findMany({ select: PLAYER_PUBLIC_SELECT, orderBy: { createdAt: "asc" } });
    return jsonOk(configs);
  } catch (err) {
    return apiError(err);
  }
}

export async function POST(req: NextRequest) {
  try {
    const actor = await requireMinRole("MANAGER");

    const { success } = await rateLimit(`player:create:${actor.id}`, { limit: 10, windowMs: 60_000 });
    if (!success) throw new ApiError("too_many_requests", 429);

    const input = createPlayerConfigSchema.parse(await req.json());
    const keyEnc = encrypt(input.apiKey);
    const secretEnc = input.apiSecret ? encrypt(input.apiSecret) : null;

    const config = await prisma.$transaction(async (tx) => {
      if (input.isDefault) {
        await tx.playerConfig.updateMany({ where: { isDefault: true }, data: { isDefault: false } });
      }
      return tx.playerConfig.create({
        data: {
          provider: input.provider,
          name: input.name,
          playerId: input.playerId,
          libraryUrl: input.libraryUrl,
          apiKeyEnc: keyEnc.ciphertext,
          apiKeyIv: keyEnc.iv,
          apiKeyTag: keyEnc.tag,
          ...(secretEnc ? { apiSecretEnc: secretEnc.ciphertext, apiSecretIv: secretEnc.iv, apiSecretTag: secretEnc.tag } : {}),
          defaultPosterMode: input.defaultPosterMode,
          isDefault: input.isDefault,
          isActive: input.isActive,
          extraConfig: { ...input.extraConfig, ...(input.siteId ? { siteId: input.siteId } : {}) } as Prisma.InputJsonValue,
        },
        select: PLAYER_PUBLIC_SELECT,
      });
    });

    await logAudit({ actor, action: "create_player_config", resourceType: "player_config", resourceId: config.id, metadata: { name: config.name } });

    return jsonOk(config, 201);
  } catch (err) {
    return apiError(err);
  }
}
