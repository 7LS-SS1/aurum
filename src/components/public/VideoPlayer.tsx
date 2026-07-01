"use client";

import { useEffect, useRef } from "react";

/** Native <video> only understands HLS (.m3u8) on Safari — hls.js fills the gap elsewhere. */
export function VideoPlayer({ src, poster }: { src: string; poster?: string }) {
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    const isHls = src.includes(".m3u8");
    const canPlayNative = video.canPlayType("application/vnd.apple.mpegurl");

    if (!isHls || canPlayNative) {
      video.src = src;
      return;
    }

    let hls: import("hls.js").default | undefined;
    let cancelled = false;
    import("hls.js").then(({ default: Hls }) => {
      if (cancelled) return;
      if (Hls.isSupported()) {
        hls = new Hls();
        hls.loadSource(src);
        hls.attachMedia(video);
      } else {
        video.src = src; // last-resort fallback
      }
    });

    return () => {
      cancelled = true;
      hls?.destroy();
    };
  }, [src]);

  return (
    <video ref={videoRef} controls poster={poster} style={{ width: "100%", height: "100%", background: "#000" }} />
  );
}
