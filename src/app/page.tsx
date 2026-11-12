import Link from "next/link";
import Image from "next/image";
import { redirect } from "next/navigation";
import s from "./landing.module.css";
export const metadata = { title: "AURUM | เว็บไซต์และพื้นที่โฆษณา", description: "เริ่มเว็บไซต์ เชื่อม Website API และเลือกพื้นที่โฆษณา Banner หรือวิดีโอ พร้อมติดตามบริการผ่านบัญชี AURUM" };
const services = [
  { number: "01", icon: "▤", name: "เว็บไซต์ที่เป็นของคุณ", tag: "WEBSITE & API", text: "เริ่มเว็บไซต์ใหม่ หรือเชื่อม Website API กับเว็บไซต์เดิม เลือกแพ็กเกจและส่งรายละเอียดให้ทีมงานดูแล", href: "/services", action: "ดูบริการเว็บไซต์", items: ["เว็บไซต์และการเชื่อมต่อ WordPress", "รายละเอียดแพ็กเกจและเงื่อนไขชัดเจน", "ติดตามคำขอผ่านบัญชีสมาชิก"] },
  { number: "02", icon: "↗", name: "พื้นที่ให้แบรนด์ของคุณ", tag: "BANNER & VIDEO ADS", text: "เลือกเว็บไซต์ ตำแหน่งโฆษณา และระยะเวลาที่เหมาะกับแคมเปญ ตรวจสอบรายการและยอดรวมก่อนชำระเงิน", href: "/services/ads-banner", action: "เลือกพื้นที่โฆษณา", items: ["เลือกตำแหน่ง Banner และวิดีโอ", "ตรวจสอบพื้นที่ว่างก่อนสั่งซื้อ", "ติดตามการชำระเงินและการติดตั้ง"] },
];
function Device({ kind = "desktop", file, alt, priority = false }: { kind?: "desktop" | "tablet" | "phone"; file: string; alt: string; priority?: boolean }) {
  const dimensions = kind === "phone" ? [390, 844] : kind === "tablet" ? [820, 1100] : [1280, 720];
  return <div className={`${s.device} ${s[kind]}`}>
    <div className={s.deviceBar} aria-hidden="true"><span>● ● ●</span><small>aurum123.com</small><span>↗</span></div>
    <Image src={`/images/landing/${file}`} alt={alt} width={dimensions[0]} height={dimensions[1]} priority={priority} sizes={kind === "phone" ? "(max-width: 600px) 120px, 220px" : "(max-width: 700px) 90vw, 700px"}/>
    {kind === "desktop" && <div className={s.deviceChin} aria-hidden="true">AURUM</div>}
  </div>;
}
export default async function HomePage({ searchParams }: { searchParams: Promise<{category?:string;q?:string;page?:string}> }) {
  const params = await searchParams;
  if (params.category || params.q || params.page) { const query = new URLSearchParams(); for (const [key,value] of Object.entries(params)) if(value) query.set(key,value); redirect(`/catalog?${query}`); }
  return <div className={s.page}>
    <header className={s.header}><Link href="/" className={s.logo}>AURUM<span>WEBSITES & ADVERTISING</span></Link><nav aria-label="เมนูหลัก"><a href="#services">บริการของเรา</a><Link href="/catalog">บริการตัวอย่าง</Link><Link href="/services/websites">เว็บไซต์ตัวอย่าง</Link><a href="#features">ฟีเจอร์</a><a href="#how">ขั้นตอนใช้งาน</a></nav><Link className={s.login} href="/login">เข้าสู่ระบบ <span aria-hidden>↗</span></Link></header>
    <main>
      <section className={s.hero}>
        <div className={s.heroCopy}><span className={s.eyebrow}><i /> YOUR NEXT DIGITAL SPACE</span><h1>พื้นที่ของคุณ<br/>โอกาสของแบรนด์<br/><em>เริ่มที่ AURUM.</em></h1><p>เริ่มเว็บไซต์ เชื่อมต่อคอนเทนต์ และเลือกพื้นที่โฆษณา<br className={s.desktopBreak}/>จัดการทุกบริการได้จากบัญชีเดียว</p><div className={s.actions}><a className={s.primary} href="#services">ค้นหาบริการที่ใช่ <span>↗</span></a><Link className={s.secondary} href="/services/websites">ชมเว็บไซต์ตัวอย่าง →</Link></div><div className={s.heroNote}><span>✓ ดูรายละเอียดก่อนสั่งซื้อ</span><span>✓ ติดตามงานได้ทุกขั้นตอน</span></div></div>
        <div className={s.visual}>
          <div className={s.heroDesktop}><Device file="services-desktop.png" alt="หน้าเลือกบริการเว็บไซต์และโฆษณาจริงของ AURUM" priority/></div>
          <div className={s.heroTablet}><Device kind="tablet" file="ads-tablet.png" alt="บริการโฆษณา AURUM บนแท็บเล็ต" priority/></div>
          <div className={s.heroPhone}><Device kind="phone" file="services-mobile.png" alt="หน้าเลือกบริการ AURUM บนมือถือ" priority/></div>
          <span className={s.deviceLabel}>DESKTOP · TABLET · MOBILE</span>
        </div>
      </section>
      <div className={s.ribbon}><span>สร้างเว็บไซต์</span><i>✳</i><span>Website API</span><i>✳</i><span>Banner Ads</span><i>✳</i><span>Video Ads</span></div>
      <section id="services" className={s.section}><div className={s.sectionHeading}><div><span className={s.eyebrow}>BUILT AROUND YOUR NEXT STEP</span><h2>สองบริการหลัก<br/>เลือกให้ตรงกับเป้าหมายคุณ</h2></div><p>เริ่มต้นจากสิ่งที่คุณต้องการ<br/>รายละเอียด ราคา และเงื่อนไขอยู่ในแต่ละบริการ</p></div><div className={s.services}>{services.map(item=><article key={item.number} className={s.service}><div className={s.serviceTop}><span>{item.tag}</span><b>{item.icon}</b></div><h3>{item.name}</h3><p>{item.text}</p><ul>{item.items.map(x=><li key={x}>✓ <span>{x}</span></li>)}</ul><Link href={item.href}>{item.action}<span>↗</span></Link></article>)}</div></section>
      <section id="features" className={s.featureSection}>
        <div className={s.featureIntro}><span className={s.eyebrow}>REAL SERVICES. ONE CONNECTED EXPERIENCE.</span><h2>เห็นสิ่งที่คุณจะได้ใช้<br/><em>ก่อนเริ่มต้นบริการ</em></h2><p>ภาพจากบริการจริงบน aurum123.com<br/>ตั้งแต่เลือกบริการ สำรวจพื้นที่โฆษณา ไปจนถึงการใช้งานผ่านมือถือ</p></div>
        <article className={s.featureRow}>
          <div className={s.featureMedia}><Device file="placements-desktop.png" alt="หน้าบริการจริง แสดงแผนผังและตัวเลือกตำแหน่ง Banner Ads"/><span className={s.mediaCaption}>แผนผังตำแหน่ง · AURUM Banner Ads</span></div>
          <div className={s.featureCopy}><span className={s.featureNumber}>01 / ADVERTISING</span><h2>เลือกจุดที่ใช่<br/>ให้แบรนด์ของคุณ</h2><p>สำรวจแผนผังตำแหน่ง Banner และ Video Ads ก่อนเลือกเว็บไซต์และพื้นที่สำหรับแคมเปญของคุณ</p><ul><li>ดูตำแหน่งบนหน้าแรกและหน้าวิดีโอ</li><li>เปรียบเทียบรูปแบบ Desktop และ Mobile</li><li>ตรวจสอบรายการและยอดรวมก่อนยืนยัน</li></ul><Link className={s.textLink} href="/services/ads-banner#placements">สำรวจตำแหน่งโฆษณา <span>↗</span></Link></div>
        </article>
        <article className={`${s.featureRow} ${s.reverse}`}>
          <div className={s.featureCopy}><span className={s.featureNumber}>02 / YOUR WORKSPACE</span><h2>บริการที่ต้องการ<br/>อยู่ในบัญชีเดียว</h2><p>เริ่มเว็บไซต์ใหม่ เชื่อม Website API หรือเลือกพื้นที่โฆษณา พร้อมช่องทางติดตามคำขอและติดต่อทีมงาน</p><ul><li>เลือกบริการให้ตรงกับเป้าหมาย</li><li>อ่านแพ็กเกจและเงื่อนไขก่อนสั่งซื้อ</li><li>กลับมาติดตามรายการในบัญชีสมาชิก</li></ul><Link className={s.textLink} href="/services/select">ดูบริการทั้งหมด <span>↗</span></Link></div>
          <div className={s.multiDevice}><div className={s.featureTablet}><Device kind="tablet" file="ads-tablet.png" alt="รายละเอียดบริการ Banner Ads บนแท็บเล็ต"/></div><div className={s.featurePhone}><Device kind="phone" file="services-mobile.png" alt="เลือกบริการเว็บไซต์ผ่านหน้าจอมือถือ"/></div><span className={s.mediaCaption}>พื้นที่บริการของคุณ · ทุกขนาดหน้าจอ</span></div>
        </article>
      </section>
      <section className={s.showcase}><div><span className={s.eyebrow}>EXPLORE AURUM</span><h2>เห็นภาพจริง<br/>ก่อนตัดสินใจ</h2><p>สำรวจเว็บไซต์ที่ผูกกับ AURUM ดูรูปแบบการแสดงผล และคลิกเข้าชมเว็บไซต์ตัวอย่างได้โดยตรง</p><Link className={s.primary} href="/services/websites">ดูเว็บไซต์ตัวอย่าง <span>↗</span></Link></div><div className={s.showcaseLinks}><Link href="/services/websites"><span>01</span><div><strong>เว็บไซต์ตัวอย่าง</strong><small>สำรวจรูปแบบเว็บไซต์ในเครือข่าย</small></div><b>↗</b></Link><Link href="/services"><span>02</span><div><strong>เว็บไซต์ / Website API</strong><small>เลือกแพ็กเกจที่เหมาะกับคุณ</small></div><b>↗</b></Link><Link href="/services/ads-banner"><span>03</span><div><strong>Banner & Video Ads</strong><small>เปิดพื้นที่ใหม่ให้แคมเปญของคุณ</small></div><b>↗</b></Link></div></section>
      <section id="how" className={s.section}><span className={s.eyebrow}>A CLEAR PATH FORWARD</span><h2>จากไอเดีย สู่บริการของคุณ</h2><div className={s.steps}>{[{t:"เลือกบริการ",d:"ดูเว็บไซต์ตัวอย่าง แพ็กเกจ หรือตำแหน่งโฆษณาที่ต้องการ"},{t:"ตรวจสอบและส่งคำขอ",d:"อ่านรายการ ราคา และเงื่อนไขให้ครบก่อนยืนยัน"},{t:"ชำระและติดตามงาน",d:"ดำเนินการตามขั้นตอนชำระเงิน แล้วติดตามผลตรวจสอบและการติดตั้งในบัญชี"}].map((x,i)=><article key={x.t}><span>0{i+1}</span><h3>{x.t}</h3><p>{x.d}</p></article>)}</div></section>
      <section className={s.faq}><div><span className={s.eyebrow}>GOOD TO KNOW</span><h2>ก่อนเริ่มต้น<br/>กับ AURUM</h2><Link href="/services/help">ดูศูนย์ช่วยเหลือ ↗</Link></div><div>{[{q:"มีเว็บไซต์อยู่แล้ว ใช้บริการได้ไหม?",a:"ดูบริการ Website API สำหรับเชื่อมเว็บไซต์เดิม และส่งรายละเอียดเว็บไซต์ให้ทีมงานตรวจสอบความเหมาะสมก่อนเริ่มบริการ"},{q:"ค่าใช้จ่ายคิดอย่างไร?",a:"บริการเว็บไซต์แสดงราคาและเงื่อนไขในหน้าแพ็กเกจ ส่วนโฆษณาคำนวณจากเว็บไซต์ ตำแหน่ง และระยะเวลาที่เลือก ตรวจสอบยอดในขั้นตอนสั่งซื้อก่อนชำระเงิน"},{q:"ติดตามคำสั่งซื้อได้ที่ไหน?",a:"เข้าสู่บัญชีสมาชิกเพื่อดูสถานะคำสั่งซื้อ การชำระเงิน และความคืบหน้าจากทีมงาน การแนบสลิปยังต้องรอเจ้าหน้าที่ตรวจสอบ"}].map(x=><details key={x.q}><summary>{x.q}</summary><p>{x.a}</p></details>)}</div></section>
      <section className={s.cta}><span className={s.eyebrow}>LET’S MAKE YOUR NEXT MOVE</span><h2>พร้อมสร้างพื้นที่ของคุณแล้วหรือยัง?</h2><p>เลือกบริการที่เหมาะ แล้วเริ่มต้นกับ AURUM</p><Link className={s.primary} href="/services/select">เลือกบริการ <span>↗</span></Link><Link href="/services/help">ปรึกษาและดูขั้นตอนการใช้งาน →</Link></section>
    </main><footer className={s.footer}><Link href="/" className={s.logo}>AURUM<span>WEBSITES & ADVERTISING</span></Link><p>เว็บไซต์และพื้นที่โฆษณา<br/>จัดการบริการของคุณในที่เดียว</p><div><Link href="/services#terms">เงื่อนไขบริการ</Link><Link href="/services/help">ติดต่อและช่วยเหลือ</Link><Link href="/account">บัญชีของฉัน</Link><Link href="/catalog">บริการตัวอย่าง</Link></div><small>© {new Date().getFullYear()} AURUM</small></footer>
  </div>;
}
