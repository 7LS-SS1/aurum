"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { VideoPlayer } from "./VideoPlayer";
import type { VideoControllerConfig } from "@/lib/player-settings";
import styles from "./SampleVideoPlayer.module.css";

export function SampleVideoPlayer({ member, movieKey, src, iframeUrl, poster, title, controller }: {
  member: boolean; movieKey: string; src?: string; iframeUrl?: string; poster?: string;
  title: string; controller?: VideoControllerConfig;
}) {
  const root = useRef<HTMLDivElement>(null);
  const [started, setStarted] = useState(false);
  const [expired, setExpired] = useState(false);
  const [remaining, setRemaining] = useState(15);
  const callback = encodeURIComponent(`/watch/${encodeURIComponent(movieKey)}`);

  useEffect(() => {
    if (member || !started || expired) return;
    const element = root.current;
    const finish = () => {
      element?.querySelector("aurum-video-player")?.shadowRoot?.querySelector("video")?.pause();
      if (document.fullscreenElement && element?.contains(document.fullscreenElement)) void document.exitFullscreen().catch(() => {});
      setExpired(true);
      setRemaining(0);
    };
    if (iframeUrl) {
      const deadline = Date.now() + 15000;
      const tick = () => {
        setRemaining(Math.max(0, Math.ceil((deadline - Date.now()) / 1000)));
        if (Date.now() >= deadline) finish();
      };
      const timer = window.setInterval(tick, 200);
      document.addEventListener("visibilitychange", tick);
      return () => { clearInterval(timer); document.removeEventListener("visibilitychange", tick); };
    }
    const update = (event: Event) => {
      const time = Number((event as CustomEvent<{ currentTime: number }>).detail?.currentTime);
      if (!Number.isFinite(time)) return;
      setRemaining(Math.max(0, Math.ceil(15 - time)));
      if (time >= 15) finish();
    };
    element?.addEventListener("aurum:timeupdate", update);
    return () => element?.removeEventListener("aurum:timeupdate", update);
  }, [member, started, expired, iframeUrl]);

  return <div ref={root} className={styles.stage}>
    {(member || (started && !expired)) ? <>
      {iframeUrl ? <iframe src={iframeUrl} title={title} allowFullScreen={member} />
        : <VideoPlayer src={src!} poster={poster} title={title} controller={controller} />}
      {!member && <span className={styles.counter} role="status">ตัวอย่าง · เหลือ {remaining} วินาที</span>}
    </> : <div className={styles.prompt}>
      <span className={styles.label}>AURUM · บริการตัวอย่าง</span>
      <h2>{expired ? "รับชมตัวอย่างครบแล้ว" : "ทดลองรับชมก่อนสมัครสมาชิก"}</h2>
      <p>{expired ? "สมัครสมาชิกหรือเข้าสู่ระบบเพื่อรับชมวิดีโอเต็ม" : iframeUrl ? "เปิดเครื่องเล่นตัวอย่างได้ 15 วินาที นับจากกดปุ่มเริ่ม" : "รับชมตัวอย่าง 15 วินาทีแรก สมาชิกเข้าสู่ระบบเพื่อรับชมเต็ม"}</p>
      <div className={styles.actions}>
        {!expired && <button type="button" onClick={() => setStarted(true)}>▶ เริ่มดูตัวอย่าง</button>}
        <Link className={expired ? styles.primary : ""} href={`/register?callbackUrl=${callback}`}>สมัครสมาชิกเพื่อรับชมเต็ม</Link>
        <Link href={`/login?callbackUrl=${callback}`}>เข้าสู่ระบบ</Link>
      </div>
    </div>}
  </div>;
}
