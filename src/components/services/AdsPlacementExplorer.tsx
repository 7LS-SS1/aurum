"use client";

import { useState } from "react";
import styles from "@/app/services/ads-banner/ads-banner.module.css";

const placements = [
  { id: "homepage_top", title: "บนหน้าแรก", scene: "home", detail: "วางแคมเปญไว้ก่อนรายการคอนเทนต์บนหน้าแรก ให้ผู้ชมเห็นตั้งแต่เริ่มสำรวจเว็บไซต์" },
  { id: "homepage_bottom", title: "ท้ายหน้าแรก", scene: "home", detail: "แสดงต่อจากรายการคอนเทนต์ เหมาะกับข้อเสนอที่อยากให้ผู้ชมเห็นเมื่อเลื่อนมาถึงท้ายหน้า" },
  { id: "video_top", title: "เหนือวิดีโอ", scene: "content", detail: "พื้นที่ป้ายเหนือเครื่องเล่นบนเว็บไซต์ของเรา แบ่งเป็นฝั่งซ้ายและขวา" },
  { id: "video_bottom", title: "ใต้เนื้อหา / วิดีโอ", scene: "content", detail: "นำเสนอข้อเสนอต่อจากเนื้อหาหรือเครื่องเล่น ให้โฆษณาเป็นส่วนหนึ่งของเส้นทางการรับชม" },
  { id: "popup", title: "ป๊อปอัปกลางหน้า", scene: "floating", detail: "พื้นที่โฆษณากลางหน้าจอที่แสดงทุกหน้า พร้อมปุ่มปิดและการจำกัดความถี่ในการแสดงผล" },
  { id: "fixed_left", title: "ลอยด้านซ้าย", scene: "floating", detail: "ยึดป้ายไว้กึ่งกลางด้านซ้ายของหน้าจอ พร้อมปุ่มปิด และตั้งค่าขนาดให้เหมาะกับแต่ละอุปกรณ์" },
  { id: "fixed_right", title: "ลอยด้านขวา", scene: "floating", detail: "เพิ่มพื้นที่โฆษณากึ่งกลางด้านขวาของหน้าจอ ปรับขนาดและรายการป้ายตามอุปกรณ์ได้" },
  { id: "fixed_bottom", title: "ลอยด้านล่าง", scene: "floating", detail: "แสดงป้ายติดขอบล่างของหน้าจอ พร้อมปุ่มปิด ควรจัดขนาดให้ไม่บังปุ่มหรือเนื้อหาหลัก" },
] as const;

export function AdsPlacementExplorer() {
  const [selected, setSelected] = useState(0);
  const [mobile, setMobile] = useState(false);
  const current = placements[selected] ?? placements[0];
  function spot(index: number) {
    const placement = placements[index];
    if (!placement) return null;
    if (index < 4) return <div key={index} className={styles.bannerPair} role="group" aria-label={`${placement.title} — ซ้ายและขวา`}>
      {(["ซ้าย", "ขวา"] as const).map(side => <button type="button" key={side} className={`${styles.spot} ${selected === index ? styles.activeSpot : ""}`} onClick={() => setSelected(index)} aria-label={`ตำแหน่ง ${index + 1}: ${placement.title} ฝั่ง${side}`} aria-pressed={selected === index}><span>{String(index + 1).padStart(2, "0")}</span><small>{side}</small></button>)}
    </div>;
    return <button type="button" key={index} className={`${styles.spot} ${styles[placement.id]} ${selected === index ? styles.activeSpot : ""}`} onClick={() => setSelected(index)} aria-label={`ตำแหน่ง ${index + 1}: ${placement.title}`} aria-pressed={selected === index}>{String(index + 1).padStart(2, "0")}{index >= 4 && <span aria-hidden="true" className={styles.closeMark}>×</span>}</button>;
  }
  return <div className={styles.explorer}>
    <div className={styles.diagramArea}>
      <div className={styles.diagramToolbar}><span>{current.scene === "home" ? "หน้าแรก" : current.scene === "content" ? "หน้าเนื้อหา" : "พื้นที่ลอยเหนือหน้าเว็บ"}</span><div role="group" aria-label="ขนาดหน้าจอจำลอง"><button type="button" aria-pressed={!mobile} onClick={() => setMobile(false)}>Desktop</button><button type="button" aria-pressed={mobile} onClick={() => setMobile(true)}>Mobile</button></div></div>
      <div className={`${styles.browser} ${mobile ? styles.mobileBrowser : ""}`}>
        <div className={styles.browserBar}><i /><i /><i /><span>OUR WEBSITE</span></div>
        <div className={styles.browserBody}>
          <div className={styles.fakeBrand}>AURUM <span>≡</span></div>
          {current.scene === "home" ? <>{spot(0)}<div className={styles.fakeCards}>{Array.from({ length: 6 }, (_, i) => <div key={i}><span>▷</span><i /></div>)}</div>{spot(1)}</> : <>{current.scene === "content" && spot(2)}<div className={styles.fakeVideo}><span>▶</span></div><div className={styles.fakeText}><i /><i /></div>{current.scene === "content" && spot(3)}</>}
          {current.scene === "floating" && <><div className={styles.dimmed} />{[4, 5, 6, 7].map(spot)}</>}
        </div>
      </div>
      <p className={styles.caption}>ตำแหน่ง 01–04 แบ่งป้ายเป็น 2 คอลัมน์ ซ้าย / ขวา ภาพจำลองไม่ได้แสดงทุกป้ายพร้อมกันบนเว็บไซต์จริง ขนาดและจุดแทรกปรับตามธีมและอุปกรณ์</p>
      <a href="/images/ads-banner/placement-map.svg" download className={styles.textLink}>ดาวน์โหลดแผนผังทั้ง 8 จุด ↗</a>
    </div>
    <div className={styles.placementMenu}><div className={styles.placementList}>{placements.map((item, i) => <button type="button" key={item.id} aria-pressed={selected === i} onClick={() => setSelected(i)}><span>{String(i + 1).padStart(2, "0")}</span>{item.title}<span aria-hidden="true">↗</span></button>)}</div><div className={styles.placementDetail} aria-live="polite"><p className={styles.kicker}>ตำแหน่ง {String(selected + 1).padStart(2, "0")}</p><h3>{current.title}</h3><p>{current.detail}</p></div></div>
  </div>;
}
