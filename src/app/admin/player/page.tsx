import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { PlayerManager } from "@/components/admin/PlayerManager";

export default async function PlayerPage() {
  const session = await auth();
  const configs = await prisma.playerConfig.findMany({
    select: {
      id: true,
      provider: true,
      name: true,
      playerId: true,
      libraryUrl: true,
      defaultPosterMode: true,
      isDefault: true,
      isActive: true,
      createdAt: true,
    },
    orderBy: { createdAt: "asc" },
  });

  return (
    <section>
      <div className="page-head">
        <h1>
          <span className="g">Media Player</span>
        </h1>
        <p>จัดการการตั้งค่า JWPlayer — apiKey/apiSecret ถูกเข้ารหัส AES-256-GCM ก่อนบันทึก ไม่มีการเก็บ plaintext</p>
      </div>
      <PlayerManager initialConfigs={JSON.parse(JSON.stringify(configs))} role={session!.user.role} />
    </section>
  );
}
