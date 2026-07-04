import { NextRequest } from "next/server";
import type { Prisma } from "@prisma/client";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { encrypt } from "@/lib/crypto";
import { apiError, jsonOk } from "@/lib/api-response";
import { requireMinRole } from "@/lib/authz";
import { logAudit } from "@/lib/audit";

const controllerSchema = z.object({
  accentColor: z.string().trim().regex(/^#[0-9a-fA-F]{6}$/).default("#d4af37"),
  controlsList: z.string().trim().max(120).default(""),
  disablePictureInPicture: z.boolean().default(false),
  defaultMuted: z.boolean().default(false),
  preload: z.enum(["none", "metadata", "auto"]).default("metadata"),
});

function readController(extraConfig: unknown) {
  const extra = (extraConfig as Record<string, unknown> | null | undefined) ?? {};
  const parsed = controllerSchema.safeParse(extra.controller);
  return parsed.success ? parsed.data : controllerSchema.parse({});
}

async function findNativePlayer() {
  return prisma.playerConfig.findFirst({
    where: { provider: "AURUM_NATIVE" },
    orderBy: [{ isDefault: "desc" }, { createdAt: "asc" }],
    select: { id: true, extraConfig: true, name: true, isActive: true },
  });
}

export async function GET() {
  try {
    await requireMinRole("STAFF");
    const config = await findNativePlayer();
    return jsonOk({ controller: readController(config?.extraConfig), exists: Boolean(config), isActive: config?.isActive ?? true });
  } catch (err) {
    return apiError(err);
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const actor = await requireMinRole("MANAGER");
    const controller = controllerSchema.parse(await req.json());
    const existing = await prisma.playerConfig.findFirst({ where: { provider: "AURUM_NATIVE" } });
    const extraConfig = { ...((existing?.extraConfig as Record<string, unknown> | null | undefined) ?? {}), controller };

    const config = await prisma.$transaction(async (tx) => {
      await tx.playerConfig.updateMany({ where: { isDefault: true, provider: { not: "AURUM_NATIVE" } }, data: { isDefault: false } });
      if (existing) {
        return tx.playerConfig.update({
          where: { id: existing.id },
          data: { extraConfig: extraConfig as Prisma.InputJsonValue, isActive: true, isDefault: true },
          select: { id: true },
        });
      }

      const keyEnc = encrypt("aurum-native-player");
      return tx.playerConfig.create({
        data: {
          provider: "AURUM_NATIVE",
          name: "AURUM Player",
          playerId: "native",
          apiKeyEnc: keyEnc.ciphertext,
          apiKeyIv: keyEnc.iv,
          apiKeyTag: keyEnc.tag,
          defaultPosterMode: "custom",
          isDefault: true,
          isActive: true,
          extraConfig: extraConfig as Prisma.InputJsonValue,
        },
        select: { id: true },
      });
    });

    await logAudit({
      actor,
      action: "update_native_player_controller",
      resourceType: "player_config",
      resourceId: config.id,
      metadata: { provider: "AURUM_NATIVE" },
    });

    return jsonOk({ controller, id: config.id });
  } catch (err) {
    return apiError(err);
  }
}
