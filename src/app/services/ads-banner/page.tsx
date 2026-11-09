import { Card, Button } from "@mui/material";
import { getAdsPage } from "@/lib/ads-page-store";
import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { AdsPlacementExplorer } from "@/components/services/AdsPlacementExplorer";
import styles from "./ads-banner.module.css";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Banner Ads — ลงโฆษณาบนเว็บไซต์ของเรา | AURUM",
  description: "โปรโมตเว็บไซต์ แบรนด์ และบริการของคุณผ่าน Banner Ads บนเว็บไซต์ของเรา รองรับ Desktop และ Mobile พร้อมแพ็กเกจรายตำแหน่งและเหมาทั้งเว็บไซต์",
  openGraph: { images: [{ url: "/images/ads-banner/hero.png", width: 1536, height: 1024, alt: "พื้นที่ Banner Ads บนเดสก์ท็อปและมือถือ" }] },
};
const money = (n: number) => n.toLocaleString("en-US");
export default async function AdsBannerPage() {
  const { config } = await getAdsPage();
  const { telegram, groups, packages } = config;
  return <div className={styles.page}>
    <main>
      <section className={styles.hero}>
        <div className={styles.heroCopy}>
          <p className={styles.kicker}>OUR WEBSITE. YOUR BRAND.</p>
          <h1>{config.copy.text4}<br /><em>{config.copy.text5}</em></h1>
          <p className={styles.lead}>{config.copy.text6}</p>
          <div className={styles.actions}><Button component={Link} variant="contained" href="/services/ads-banner/book">เลือกช่องและส่งคำขอจอง ↗</Button><a href="#packages" className={styles.textLink}>{config.copy.text8}</a></div>
          <div className={styles.heroFacts}><span><b>08</b>{config.copy.text9}</span><span><b>＋</b>{config.copy.text10}</span><span><b>30</b>{config.copy.text11}</span></div>
        </div>
        <figure className={styles.heroVisual}><Image src="/images/ads-banner/hero.png" alt="ภาพแนวคิดพื้นที่แบนเนอร์สีทองรอบเว็บไซต์บนคอมพิวเตอร์และมือถือ" width={1536} height={1024} priority sizes="(max-width: 850px) 100vw, 58vw" /><figcaption>{config.copy.text12}</figcaption></figure>
      </section>
      <div className={styles.ribbon}><span>BANNER</span><i /><span>POPUP</span><i /><span>FIXED ADS</span><i /><span>VIDEO PRE-ROLL</span></div>
      {config.promotions.some(post => post.published) && <section className={styles.section} aria-label="โปรโมชั่น"><div className={styles.sectionHeading}><h2>โปรโมชั่นล่าสุด</h2></div><div className={styles.rateGrid}>{config.promotions.filter(post => post.published).map(post => <Card component="article" className={styles.rateCard} key={post.id}>{post.imageUrl && <img src={post.imageUrl} alt={post.title} loading="lazy" className={styles.promotionImage} />}<p className={styles.kicker}>PROMOTION</p><h3>{post.title}</h3><p className={styles.promotionBody}>{post.body}</p><a href={telegram} target="_blank" rel="noopener noreferrer" className={styles.textLink}>สอบถามโปรโมชั่น ↗</a></Card>)}</div></section>}
      <section id="placements" className={styles.section}>
        <div className={styles.sectionHeading}><div><p className={styles.kicker}>01 / EXPLORE THE PLACEMENTS</p><h2>{config.copy.text13}<br /><span>{config.copy.text14}</span></h2></div><p>{config.copy.text15}</p></div>
        <AdsPlacementExplorer />
      </section>
      <section id="video" className={`${styles.section} ${styles.videoSection}`}>
        <div className={styles.sectionHeading}><div><p className={styles.kicker}>02 / BEFORE THE PLAY</p><h2>{config.copy.text16}<br /><span>{config.copy.text17}</span></h2></div><p>{config.copy.text18}</p></div>
        <div className={styles.playSequence}>{[
          { label: "เริ่มต้น", title: "กดเล่นวิดีโอ", description: "ผู้ชมเลือกเนื้อหาบนเว็บไซต์ของเรา", type: "content" },
          { label: "ก่อนรับชม", title: "Video Ads", description: "นำเสนอวิดีโอโฆษณาของแบรนด์ก่อนเข้าสู่เนื้อหา", type: "ad" },
          { label: "ต่อเนื่องสู่เนื้อหา", title: "รับชมวิดีโอหลัก", description: "เมื่อโฆษณาจบหรือข้ามได้ ผู้ชมเข้าสู่เนื้อหาที่เลือก", type: "content" },
        ].map((step, i) => <Card component="article" key={step.title}><div className={`${styles.sequenceScreen} ${styles[step.type]}`}><span>▶</span>{step.type === "ad" && <b>AD <small>↠</small></b>}</div><p className={styles.kicker}>0{i + 1} / {step.label}</p><h3>{step.title}</h3><p>{step.description}</p></Card>)}</div>
      </section>
      <section className={`${styles.section} ${styles.controlSection}`}>
        <div><p className={styles.kicker}>03 / INCLUDED WITH YOUR CAMPAIGN</p><h2>{config.copy.text19}<br /><span>{config.copy.text20}</span></h2></div>
        <div className={styles.controlList}>{config.benefits.map(([n, title, body]) => <div key={n}><span>{n}</span><div><h3>{title}</h3><p>{body}</p></div></div>)}</div>
      </section>
      <section id="packages" className={styles.section}>
        <div className={styles.sectionHeading}><div><p className={styles.kicker}>04 / ADVERTISING RATES</p><h2>{config.copy.text21}<br /><span>{config.copy.text22}</span></h2></div><p>{config.copy.text23}</p></div>
        <div className={styles.rateGrid}>{groups.map(group => <Card component="article" className={styles.rateCard} key={group.title}>
          <p className={styles.kicker}>{group.title}</p><h3>{group.subtitle}</h3>
          <dl>{group.rows.map(([name, detail, price, unit]) => <div key={name}><dt>{name}<small>{detail}</small></dt><dd><strong>{money(price)}</strong> <span>{unit}</span></dd></div>)}</dl>
          <div className={styles.rateBundle}><p>{group.bundle}</p><strong>{money(group.total)} <small>{config.copy.text24}</small></strong></div>
          <a className={styles.textLink} href={telegram} target="_blank" rel="noopener noreferrer">{config.copy.text25}</a>
        </Card>)}</div>
        <p className={styles.caption}>{config.copy.text26}</p>
      </section>
      <section className={`${styles.section} ${styles.offerSection}`}>
        <div className={styles.offerIntro}><p className={styles.kicker}>05 / WHOLE WEBSITE PACKAGE</p><h2>{config.copy.text27}<br /><span>{config.copy.text28}</span></h2><Image src="/images/ads-banner/promotion.png" width={1254} height={1254} alt="ภาพโปรโมชั่นแพ็กเกจโฆษณาสีทอง พร้อมสัญลักษณ์แบนเนอร์และวิดีโอ" sizes="(max-width: 850px) 100vw, 40vw" /><p className={styles.caption}>{config.copy.text29}</p></div>
        <div className={styles.offers}>{packages.map(plan => <Card component="article" key={plan.months}>
          <p className={styles.kicker}>{plan.discount ? `ประหยัด ${plan.discount}%` : "ครบทุกพื้นที่"}</p><h3>แพ็กเกจ {plan.months} เดือน</h3>
          <div className={styles.price}>{money(plan.price)}<span>บาท / {plan.months} เดือน</span></div>
          {plan.discount > 0 && <p className={styles.renewal}>{config.copy.text30}<del>{money((packages[0]!.price / packages[0]!.months) * plan.months)} บาท</del> · ลด {plan.discount}%</p>}
          <a className={styles.primary} href={telegram} target="_blank" rel="noopener noreferrer">{config.copy.text31}</a>
        </Card>)}</div>
      </section>
      <section className={`${styles.section} ${styles.closing}`}><p className={styles.kicker}>LET’S FIND YOUR SPACE</p><h2>{config.copy.text32}<br /><span>{config.copy.text33}</span></h2><p>{config.copy.text34}</p><a className={styles.primary} href={telegram} target="_blank" rel="noopener noreferrer">{config.copy.text35}</a></section>
    </main>
  </div>;
}
