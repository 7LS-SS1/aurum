"use client";

import { useEffect, useRef, useState } from "react";
import type { VideoControllerConfig } from "@/lib/player-settings";

function formatTime(seconds: number): string {
  const s = Math.floor(seconds || 0);
  const m = Math.floor(s / 60);
  const rest = s % 60;
  return `${m}:${rest < 10 ? "0" : ""}${rest}`;
}

const SPEEDS = [0.5, 0.75, 1, 1.25, 1.5, 2];

/** Native <video> only understands HLS (.m3u8) on Safari — hls.js fills the gap elsewhere. */
export function VideoPlayer({ src, poster, controller }: { src: string; poster?: string; controller?: VideoControllerConfig }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);

  const [playing, setPlaying] = useState(false);
  const [showPoster, setShowPoster] = useState(true);
  const [progressPct, setProgressPct] = useState(0);
  const [current, setCurrent] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(1);
  const [muted, setMuted] = useState(controller?.defaultMuted ?? false);
  const [speedMenuOpen, setSpeedMenuOpen] = useState(false);
  const [speed, setSpeed] = useState(1);
  const [theater, setTheater] = useState(false);

  const hideSpeed = controller?.controlsList?.includes("noplaybackrate") ?? false;

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

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    const onPlay = () => {
      setPlaying(true);
      setShowPoster(false);
    };
    const onPause = () => setPlaying(false);
    const onEnded = () => {
      setPlaying(false);
      setShowPoster(true);
    };
    const onTimeUpdate = () => {
      if (!video.duration) return;
      setProgressPct((video.currentTime / video.duration) * 100);
      setCurrent(video.currentTime);
    };
    const onLoadedMetadata = () => setDuration(video.duration);

    video.addEventListener("play", onPlay);
    video.addEventListener("pause", onPause);
    video.addEventListener("ended", onEnded);
    video.addEventListener("timeupdate", onTimeUpdate);
    video.addEventListener("loadedmetadata", onLoadedMetadata);
    return () => {
      video.removeEventListener("play", onPlay);
      video.removeEventListener("pause", onPause);
      video.removeEventListener("ended", onEnded);
      video.removeEventListener("timeupdate", onTimeUpdate);
      video.removeEventListener("loadedmetadata", onLoadedMetadata);
    };
  }, []);

  function togglePlay() {
    const video = videoRef.current;
    if (!video) return;
    if (video.paused) video.play().catch(() => {});
    else video.pause();
  }

  function skip(delta: number) {
    const video = videoRef.current;
    if (!video) return;
    video.currentTime = Math.max(0, Math.min(video.duration || 0, video.currentTime + delta));
  }

  function seek(e: React.MouseEvent<HTMLDivElement>) {
    const video = videoRef.current;
    if (!video || !video.duration) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const pct = (e.clientX - rect.left) / rect.width;
    video.currentTime = pct * video.duration;
  }

  function onVolumeChange(v: number) {
    const video = videoRef.current;
    if (!video) return;
    video.volume = v;
    video.muted = v === 0;
    setVolume(v);
    setMuted(v === 0);
  }

  function toggleMute() {
    const video = videoRef.current;
    if (!video) return;
    video.muted = !video.muted;
    setMuted(video.muted);
  }

  function setPlaybackSpeed(rate: number) {
    const video = videoRef.current;
    if (!video) return;
    video.playbackRate = rate;
    setSpeed(rate);
    setSpeedMenuOpen(false);
  }

  function toggleFullscreen() {
    const stage = stageRef.current;
    if (!stage) return;
    if (!document.fullscreenElement) {
      stage.requestFullscreen?.().catch(() => {});
    } else {
      document.exitFullscreen();
    }
  }

  return (
    <div ref={stageRef} className={`video-stage ${theater ? "theater" : ""}`}>
      <video ref={videoRef} playsInline preload={controller?.preload ?? "metadata"} muted={muted} style={{ accentColor: controller?.accentColor }} />

      {showPoster && (
        <div className="poster-fb">
          {poster && (
            // eslint-disable-next-line @next/next/no-img-element -- external CDN hosts vary per env
            <img src={poster} alt="" style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover" }} />
          )}
          <button className="big-play" onClick={togglePlay} aria-label="เล่น">
            <svg width="34" height="34" viewBox="0 0 24 24" fill="currentColor">
              <path d="M8 5v14l11-7z" />
            </svg>
          </button>
        </div>
      )}

      <div className="controls">
        <div className="progress" onClick={seek}>
          <div className="filled" style={{ width: `${progressPct}%` }} />
          <div className="knob" style={{ left: `${progressPct}%` }} />
        </div>
        <div className="ctrl-row">
          <button className="cbtn" onClick={togglePlay} aria-label="เล่น/หยุด">
            {playing ? (
              <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor">
                <path d="M6 4h4v16H6zM14 4h4v16h-4z" />
              </svg>
            ) : (
              <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor">
                <path d="M8 5v14l11-7z" />
              </svg>
            )}
          </button>
          <button className="cbtn" onClick={() => skip(-10)} aria-label="ถอย 10 วิ">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M11 17l-5-5 5-5M18 17l-5-5 5-5" />
            </svg>
          </button>
          <button className="cbtn" onClick={() => skip(10)} aria-label="ไป 10 วิ">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M13 17l5-5-5-5M6 17l5-5-5-5" />
            </svg>
          </button>
          <div className="vol">
            <button className="cbtn" onClick={toggleMute} aria-label="เสียง">
              {muted || volume === 0 ? (
                <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M11 5 6 9H2v6h4l5 4z" />
                  <path d="M22 9l-6 6M16 9l6 6" fill="none" stroke="currentColor" strokeWidth="2" />
                </svg>
              ) : (
                <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M11 5 6 9H2v6h4l5 4V5z" />
                  <path d="M15.5 8.5a5 5 0 0 1 0 7" fill="none" stroke="currentColor" strokeWidth="2" />
                </svg>
              )}
            </button>
            <input type="range" min={0} max={1} step={0.05} value={muted ? 0 : volume} onChange={(e) => onVolumeChange(Number(e.target.value))} aria-label="ระดับเสียง" />
          </div>
          <span className="time">
            {formatTime(current)} / {formatTime(duration)}
          </span>
          <span className="spacer" />
          {!hideSpeed && (
            <div className="menu">
              <button className="cbtn" onClick={() => setSpeedMenuOpen((v) => !v)} aria-label="ความเร็ว" title="ความเร็ว">
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M12 22a9 9 0 1 0-9-9" />
                  <path d="M12 7v5l3 2" />
                  <path d="M3 13H1" />
                </svg>
              </button>
              {speedMenuOpen && (
                <div className="menu-pop open">
                  <div className="mt">ความเร็ว</div>
                  {SPEEDS.map((r) => (
                    <button key={r} className={speed === r ? "sel" : ""} onClick={() => setPlaybackSpeed(r)}>
                      {r === 1 ? "ปกติ" : `${r}x`}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
          <button className="cbtn" onClick={() => setTheater((v) => !v)} aria-label="โหมดโรงภาพยนตร์" title="โหมดโรงภาพยนตร์">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <rect x="2" y="6" width="20" height="12" rx="2" />
            </svg>
          </button>
          <button className="cbtn" onClick={toggleFullscreen} aria-label="เต็มจอ" title="เต็มจอ">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3M3 16v3a2 2 0 0 0 2 2h3m13-5v3a2 2 0 0 1-2 2h-3" />
            </svg>
          </button>
        </div>
      </div>
    </div>
  );
}
