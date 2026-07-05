"use client";

import { useEffect } from "react";
import type { CSSProperties } from "react";
import type { VideoControllerConfig } from "@/lib/player-settings";

const PLAYER_SCRIPT_ID = "aurum-video-player-bundle";
const PLAYER_SCRIPT_SRC = "/embeds/aurum-video-player.js";

function ensurePlayerBundle() {
  if (typeof window === "undefined") return;
  if (customElements.get("aurum-video-player")) return;
  if (document.getElementById(PLAYER_SCRIPT_ID)) return;

  const script = document.createElement("script");
  script.id = PLAYER_SCRIPT_ID;
  script.src = PLAYER_SCRIPT_SRC;
  script.async = true;
  document.head.appendChild(script);
}

export function VideoPlayer({
  src,
  poster,
  title,
  controller,
}: {
  src: string;
  poster?: string;
  title?: string;
  controller?: VideoControllerConfig;
}) {
  useEffect(() => {
    ensurePlayerBundle();
  }, []);

  const style = {
    "--aurum-accent": controller?.accentColor,
  } as CSSProperties;

  return (
    <aurum-video-player
      src={src}
      poster={poster}
      title={title}
      muted={controller?.defaultMuted ? true : undefined}
      preload={controller?.preload ?? "metadata"}
      style={style}
    />
  );
}
