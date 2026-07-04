import { prisma } from "@/lib/prisma";

export interface VideoControllerConfig {
  accentColor?: string;
  controlsList?: string;
  disablePictureInPicture?: boolean;
  defaultMuted?: boolean;
  preload?: "none" | "metadata" | "auto";
}

function asControllerConfig(value: unknown): VideoControllerConfig {
  const extra = (value as Record<string, unknown> | null | undefined) ?? {};
  const controller = (extra.controller as Record<string, unknown> | null | undefined) ?? {};
  return {
    accentColor: typeof controller.accentColor === "string" ? controller.accentColor : undefined,
    controlsList: typeof controller.controlsList === "string" ? controller.controlsList : undefined,
    disablePictureInPicture: typeof controller.disablePictureInPicture === "boolean" ? controller.disablePictureInPicture : undefined,
    defaultMuted: typeof controller.defaultMuted === "boolean" ? controller.defaultMuted : undefined,
    preload: controller.preload === "none" || controller.preload === "metadata" || controller.preload === "auto" ? controller.preload : undefined,
  };
}

export async function getDefaultVideoControllerConfig(): Promise<VideoControllerConfig> {
  const nativeConfig = await prisma.playerConfig.findFirst({
    where: { provider: "AURUM_NATIVE", isActive: true },
    orderBy: [{ isDefault: "desc" }, { createdAt: "asc" }],
    select: { extraConfig: true },
  });
  if (nativeConfig) return asControllerConfig(nativeConfig.extraConfig);

  const config = await prisma.playerConfig.findFirst({
    where: { isActive: true },
    orderBy: [{ isDefault: "desc" }, { createdAt: "asc" }],
    select: { extraConfig: true },
  });
  return asControllerConfig(config?.extraConfig);
}
