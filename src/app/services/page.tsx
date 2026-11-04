import type { Metadata } from "next";
import Link from "next/link";
import styles from "./services.module.css";
import { getServicePage } from "@/lib/service-page-store";
import { type ServicePageConfig, renderServiceText } from "@/lib/service-page-config";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "การเข้าถึงบริการ | AURUM",
  description: "เว็บไซต์พร้อมคอนเทนต์ AV และคลิป เชื่อมต่อ WordPress ผ่าน Website API พร้อมตัวเลือกเสริมระบบ Video Ads และ Banner Ads ดูแพ็กเกจและติดต่อเจ้าหน้าที่",
};

const money = (value: number) => value.toLocaleString("en-US");

function Contact({ children, telegram }: { children: React.ReactNode; telegram: string }) {
  return <a className={styles.button} href={telegram} target="_blank" rel="noopener noreferrer">{children}<span aria-hidden="true"> ↗</span></a>;
}

export default async function ServicesPage() {
  const { config } = await getServicePage();
  return <ServicesContent config={config} />;
}

function ServicesContent({ config }: { config: ServicePageConfig }) {
  const { telegram, plans, hosting, contractMonths } = config;
  const text = (key: keyof ServicePageConfig["copy"]) => renderServiceText(config.copy[key], contractMonths);
  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <Link href="/" className={styles.logo} aria-label="AURUM หน้าแรก">AURUM<span>WEBSITE SERVICES</span></Link>
        <nav aria-label="เมนูบริการ"><a href="#packages">แพ็กเกจ</a><a href="#ads">ระบบโฆษณา</a><a href="#terms">เงื่อนไข</a></nav>
        <a className={styles.contactLink} href={telegram} target="_blank" rel="noopener noreferrer">ติดต่อเจ้าหน้าที่ ↗</a>
      </header>
      <main>
        <section className={styles.hero}>
          <p className={styles.eyebrow}>{text("text1")}</p>
          <h1>{text("heroTitle")}<br /><span>{text("text2")}</span></h1>
          <p className={styles.lead}>{text("text3")}</p>
          <div className={styles.actions}><a className={styles.button} href="#packages">เลือกแพ็กเกจของคุณ ↓</a><a href={telegram} target="_blank" rel="noopener noreferrer">ปรึกษาก่อนเริ่มใช้งาน ↗</a></div>
          <div className={styles.facts}><span>{text("text4")}</span><span>02 / โปรโมชั่นเดือนแรก</span><span>{text("text5")}</span></div>
        </section>

        <section id="packages" className={styles.section}>
          <p className={styles.eyebrow}>01 / WEBSITE & CONTENT</p>
          <h2>{text("text6")}</h2>
          <p className={styles.muted}>{text("text7")}</p>
          <div className={styles.grid}>
            {plans.map((plan, index) => plan.enabled && <article key={index} className={`${styles.card} ${index === 2 ? styles.featured : ""}`}>
              <p className={styles.tag}>{index === 2 ? "ครบทั้งสองบริการ" : "เลือกหนึ่งประเภทคอนเทนต์"}</p>
              <h3>{plan.name}</h3><p className={styles.muted}>{plan.intro}</p>
              <p className={styles.price}>{money(plan.first)}<span>บาท / เดือนแรก</span></p>
              <div className={styles.renewal}><strong>เดือนถัดไป {money(plan.monthly + hosting)} บาท/เดือน</strong><p>ค่าบริการ {money(plan.monthly)} + โฮสติ้ง {money(hosting)} บาท</p><p>ใช้โฮสติ้งของคุณเอง: {money(plan.monthly)} บาท/เดือน</p></div>
              <ul><li>{text("text8")}</li><li>รับชมคอนเทนต์ {plan.name} ระหว่างที่มีสิทธิ์ตามสัญญา</li><li>{text("text9")}</li><li>{text("text10")}</li></ul>
              <Contact telegram={telegram}>สอบถามแพ็กเกจ {plan.name}</Contact>
              <p className={styles.small}>{text("text11")}</p>
            </article>)}
          </div>
          <div className={styles.promo}><div><p className={styles.eyebrow}>WELCOME OFFER</p><h3>{text("text12")}</h3></div><ul><li>{text("text13")}</li><li>{text("text14")}</li><li>{text("text15")}</li></ul><p className={styles.small}>{text("text16")}</p></div>
        </section>

        <section id="ads" className={styles.section}>
          <p className={styles.eyebrow}>02 / OPTIONAL ADS SYSTEM</p><h2>{text("text17")}</h2>
          <p className={styles.muted}>{text("text18")}</p>
          <div className={styles.twoColumns}>{config.ads.map((ad, index) => ad.enabled && <article className={styles.card} key={index}><h3>{ad.name}</h3><p className={styles.muted}>{ad.text}</p><p className={styles.price}>{money(ad.first)}<span>บาท / เดือนแรก</span></p><p>เดือนถัดไป <strong>{money(ad.monthly)} บาท/เดือน</strong></p><p className={styles.small}>{text("text19")}</p><Contact telegram={telegram}>สอบถามบริการโฆษณา</Contact></article>)}</div>
          <p className={styles.notice}>{text("text20")}</p>
        </section>

        <section className={styles.section}><p className={styles.eyebrow}>03 / GET STARTED</p><h2>{text("text21")}</h2><ol className={styles.steps}>{[text("step1"), text("step2"), text("step3"), text("step4")].map((step, index) => <li key={step}><span>0{index + 1}</span>{step}</li>)}</ol></section>

        <section id="terms" className={styles.section}><p className={styles.eyebrow}>04 / SERVICE DETAILS</p><h2>{text("text22")}</h2>
          <div className={styles.terms}>
            <details open><summary>{text("contractTitle")}</summary><p>{text("text23")}</p></details>
            <details><summary>{text("text24")}</summary><p>{text("text25")}</p></details>
            <details><summary>{text("text26")}</summary><p>{text("text27")}</p></details>
            <details><summary>{text("text28")}</summary><p>{text("text29")}</p></details>
            <details><summary>{text("text30")}</summary><p>{text("text31")}</p></details>
          </div>
        </section>
        <section className={styles.closing}><p className={styles.eyebrow}>LET’S START YOUR WEBSITE</p><h2>{text("text32")}</h2><p>{text("text33")}</p><Contact telegram={telegram}>ติดต่อเจ้าหน้าที่ผ่าน Telegram</Contact></section>
      </main>
      <footer className={styles.footer}><Link href="/">AURUM · กลับหน้าแรก</Link><span>{text("text34")}</span></footer>
    </div>
  );
}
