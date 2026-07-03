import type { PlayerConfig } from "@prisma/client";
import { prisma } from "@/lib/prisma";

type PlayerIdentity = Pick<PlayerConfig, "playerId"> | null | undefined;

export function buildJwPlayerIframeUrl(mediaId?: string | null, player?: PlayerIdentity): string | undefined {
  const cleanMediaId = mediaId?.trim();
  const cleanPlayerId = player?.playerId?.trim();
  if (!cleanMediaId || !cleanPlayerId) return undefined;
  return `https://cdn.jwplayer.com/players/${encodeURIComponent(cleanMediaId)}-${encodeURIComponent(cleanPlayerId)}.html`;
}

export async function getDefaultJwPlayerConfig(): Promise<PlayerIdentity> {
  return prisma.playerConfig.findFirst({
    where: { provider: "JWPLAYER", isActive: true },
    orderBy: [{ isDefault: "desc" }, { createdAt: "asc" }],
    select: { playerId: true },
  });
}
