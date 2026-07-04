import { auth } from "@/auth";
import { PlayerManager, type NativeControllerConfig } from "@/components/admin/PlayerManager";
import { getDefaultVideoControllerConfig } from "@/lib/player-settings";

function withDefaults(config: Awaited<ReturnType<typeof getDefaultVideoControllerConfig>>): NativeControllerConfig {
  return {
    accentColor: config.accentColor ?? "#d4af37",
    controlsList: config.controlsList ?? "",
    disablePictureInPicture: config.disablePictureInPicture ?? false,
    defaultMuted: config.defaultMuted ?? false,
    preload: config.preload ?? "metadata",
  };
}

export default async function PlayerPage() {
  const session = await auth();
  const controller = withDefaults(await getDefaultVideoControllerConfig());

  return (
    <section>
      <div className="page-head">
        <h1>
          <span className="g">AURUM Player</span>
        </h1>
        <p>ตั้งค่า video controller สำหรับ Bunny Stream และ native player ของระบบ</p>
      </div>
      <PlayerManager initialController={controller} role={session!.user.role} />
    </section>
  );
}
