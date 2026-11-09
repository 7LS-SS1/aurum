"use client";

import { useEffect, useRef, useState } from "react";
import { sitePreviewUrl } from "@/lib/site-preview";
import s from "./TargetSitesGallery.module.css";

export function SitePreview({ baseUrl, name }: { baseUrl: string; name: string }) {
  const source = sitePreviewUrl(baseUrl);
  const container = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [loaded, setLoaded] = useState(false);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    const node = container.current;
    if (!node || !source) return;
    const observer = new IntersectionObserver(entries => {
      if (entries.some(entry => entry.isIntersecting)) { setVisible(true); observer.disconnect(); }
    }, { rootMargin: "100px" });
    observer.observe(node);
    return () => observer.disconnect();
  }, [source]);
  useEffect(() => {
    if (!visible || !source) return;
    // mShots queues new domains on first request. Retry twice, never poll indefinitely.
    const timers = [12000, 30000].map(delay => setTimeout(() => {
      setFailed(false);
      setAttempt(value => value + 1);
    }, delay));
    return () => timers.forEach(clearTimeout);
  }, [visible, source]);
  return <div ref={container} className={s.previewContent}>
    {(!loaded || failed) && <div className={s.placeholder}><span aria-hidden="true">W</span><small>{!source ? "ยังไม่มีภาพตัวอย่างเว็บไซต์" : failed ? "ยังโหลดภาพไม่ได้" : "กำลังเตรียมภาพเว็บไซต์…"}</small></div>}
    {visible && source && !failed && (
      // eslint-disable-next-line @next/next/no-img-element -- browser requests the approved screenshot provider directly; no server proxy or credentials.
      <img key={attempt} className={s.previewImage} src={`${source}${attempt ? `&aurum_reload=${attempt}` : ""}`} alt={`ภาพตัวอย่าง ${name}`} loading="lazy" decoding="async" referrerPolicy="no-referrer" onLoad={() => setLoaded(true)} onError={() => { setLoaded(false); setFailed(true); }} />
    )}
    {source && <button type="button" className={s.refreshImage} aria-label={`โหลดภาพ ${name} ใหม่`} title="โหลดภาพใหม่ · ภาพจาก WordPress.com อาจยังอยู่ระหว่างสร้าง" onClick={() => { setFailed(false); setLoaded(false); setAttempt(value => value + 1); }}>↻</button>}
  </div>;
}
