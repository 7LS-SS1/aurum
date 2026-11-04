import type { Metadata } from "next";
import Link from "next/link";
import styles from "./services.module.css";

export const metadata: Metadata = {
  title: "การเข้าถึงบริการ | AURUM",
  description: "เว็บไซต์พร้อมคอนเทนต์ AV และคลิป เชื่อมต่อ WordPress ผ่าน Website API พร้อมตัวเลือกเสริมระบบ Video Ads และ Banner Ads ดูแพ็กเกจและติดต่อเจ้าหน้าที่",
};

const telegram = "https://t.me/thaitubevideo";
const plans = [
  { name: "AV", intro: "สำหรับเว็บไซต์ที่เน้นคอนเทนต์ AV", first: 1990, monthly: 3490 },
  { name: "คลิป", intro: "สำหรับเว็บไซต์ที่เน้นคอนเทนต์คลิป", first: 1990, monthly: 3490 },
  { name: "AV + คลิป", intro: "รวมสองประเภทคอนเทนต์ไว้ในเว็บไซต์เดียว", first: 2990, monthly: 5490 },
];
const money = (value: number) => value.toLocaleString("en-US");

function Contact({ children }: { children: React.ReactNode }) {
  return <a className={styles.button} href={telegram} target="_blank" rel="noopener noreferrer">{children}<span aria-hidden="true"> ↗</span></a>;
}

export default function ServicesPage() {
  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <Link href="/" className={styles.logo} aria-label="AURUM หน้าแรก">AURUM<span>WEBSITE SERVICES</span></Link>
        <nav aria-label="เมนูบริการ"><a href="#packages">แพ็กเกจ</a><a href="#ads">ระบบโฆษณา</a><a href="#terms">เงื่อนไข</a></nav>
        <a className={styles.contactLink} href={telegram} target="_blank" rel="noopener noreferrer">ติดต่อเจ้าหน้าที่ ↗</a>
      </header>
      <main>
        <section className={styles.hero}>
          <p className={styles.eyebrow}>AURUM · การเข้าถึงบริการ</p>
          <h1>เว็บไซต์ของคุณ<br /><span>พร้อมเริ่มต้นอย่างเป็นระบบ</span></h1>
          <p className={styles.lead}>เปิดเว็บไซต์ใหม่พร้อมโดเมนและโฮสติ้ง หรือเชื่อมต่อ WordPress ที่คุณมีอยู่กับ Website API ของเรา เลือกบริการ AV คลิป หรือทั้งสองประเภท พร้อมเพิ่มระบบจัดการโฆษณาได้ตามต้องการ</p>
          <div className={styles.actions}><a className={styles.button} href="#packages">เลือกแพ็กเกจของคุณ ↓</a><a href={telegram} target="_blank" rel="noopener noreferrer">ปรึกษาก่อนเริ่มใช้งาน ↗</a></div>
          <div className={styles.facts}><span>01 / เว็บไซต์ใหม่หรือเว็บไซต์เดิม</span><span>02 / โปรโมชั่นเดือนแรก</span><span>03 / สัญญาขั้นต่ำ 3 เดือน</span></div>
        </section>

        <section id="packages" className={styles.section}>
          <p className={styles.eyebrow}>01 / WEBSITE & CONTENT</p>
          <h2>เลือกคอนเทนต์ที่เหมาะกับเว็บไซต์คุณ</h2>
          <p className={styles.muted}>ราคาพิเศษสำหรับสมาชิกใหม่ในเดือนแรก · หน่วยเงินบาท · ระบบโฆษณาเป็นตัวเลือกเสริม</p>
          <div className={styles.grid}>
            {plans.map((plan, index) => <article key={plan.name} className={`${styles.card} ${index === 2 ? styles.featured : ""}`}>
              <p className={styles.tag}>{index === 2 ? "ครบทั้งสองบริการ" : "เลือกหนึ่งประเภทคอนเทนต์"}</p>
              <h3>{plan.name}</h3><p className={styles.muted}>{plan.intro}</p>
              <p className={styles.price}>{money(plan.first)}<span>บาท / เดือนแรก</span></p>
              <div className={styles.renewal}><strong>เดือนถัดไป {money(plan.monthly + 590)} บาท/เดือน</strong><p>ค่าบริการ {money(plan.monthly)} + โฮสติ้ง 590 บาท</p><p>ใช้โฮสติ้งของคุณเอง: {money(plan.monthly)} บาท/เดือน</p></div>
              <ul><li>เชื่อมต่อข้อมูลผ่าน Website API สำหรับ 1 เว็บไซต์</li><li>รับชมคอนเทนต์ {plan.name} ระหว่างที่มีสิทธิ์ตามสัญญา</li><li>ติดตั้งและตั้งค่าการเชื่อมต่อครั้งแรก</li><li>ใช้กับเว็บไซต์ใหม่หรือ WordPress ของคุณ</li></ul>
              <Contact>สอบถามแพ็กเกจ {plan.name}</Contact>
              <p className={styles.small}>สัญญาขั้นต่ำ 3 เดือน · ยืนยันรายละเอียดกับเจ้าหน้าที่ก่อนชำระเงิน</p>
            </article>)}
          </div>
          <div className={styles.promo}><div><p className={styles.eyebrow}>WELCOME OFFER</p><h3>เริ่มเว็บไซต์ใหม่ พร้อมสิทธิพิเศษเดือนแรก</h3></div><ul><li>ฟรีค่าจดโดเมนมาตรฐานปีแรก 1 ชื่อ ตามวงเงินและชื่อที่เจ้าหน้าที่ยืนยัน</li><li>ฟรีโฮสติ้งเดือนแรก และค่าติดตั้งเว็บไซต์ครั้งแรก</li><li>ตั้งค่าชื่อเว็บไซต์ โลโก้ สี และเมนูพื้นฐาน</li></ul><p className={styles.small}>โดเมนจดในชื่อผู้ให้บริการ ไม่รวมโดเมนพรีเมียมและการโอนกรรมสิทธิ์ ค่าโฮสติ้งเริ่มคิดเดือนที่ 2 ส่วนค่าต่ออายุโดเมนปีถัดไปแจ้งก่อนยืนยันสมัคร</p></div>
        </section>

        <section id="ads" className={styles.section}>
          <p className={styles.eyebrow}>02 / OPTIONAL ADS SYSTEM</p><h2>เพิ่มพื้นที่โฆษณาให้เว็บไซต์ของคุณ</h2>
          <p className={styles.muted}>บริการเสริมระบบจัดการโฆษณาบน WordPress เพื่อให้คุณนำพื้นที่ไปเสนอขายแก่ผู้ลงโฆษณา เลือกใช้งานเพิ่มเติมจากแพ็กเกจคอนเทนต์ได้</p>
          <div className={styles.twoColumns}>{[{ name: "Banner Ads", first: 290, monthly: 590, text: "จัดการพื้นที่ป้ายโฆษณาบนเว็บไซต์ของคุณ" }, { name: "Video Ads + Banner Ads", first: 490, monthly: 990, text: "เพิ่มโฆษณาวิดีโอร่วมกับพื้นที่แบนเนอร์" }].map(ad => <article className={styles.card} key={ad.name}><h3>{ad.name}</h3><p className={styles.muted}>{ad.text}</p><p className={styles.price}>{money(ad.first)}<span>บาท / เดือนแรก</span></p><p>เดือนถัดไป <strong>{money(ad.monthly)} บาท/เดือน</strong></p><p className={styles.small}>ชำระเพิ่มจากแพ็กเกจหลัก เลือกรูปแบบและตำแหน่งตามที่ Ads Banner Plugin รองรับ โดยเจ้าหน้าที่ยืนยันขอบเขตก่อนติดตั้ง</p><Contact>สอบถามบริการโฆษณา</Contact></article>)}</div>
          <p className={styles.notice}>ค่าบริการนี้เป็นค่าระบบจัดการโฆษณา ไม่รวมการซื้อพื้นที่บนเว็บไซต์อื่น การจัดหาผู้ลงโฆษณา หรือการผลิตสื่อ และไม่มีการรับประกันยอดคลิก ยอดขาย หรือรายได้</p>
        </section>

        <section className={styles.section}><p className={styles.eyebrow}>03 / GET STARTED</p><h2>เริ่มต้นกับเจ้าหน้าที่ใน 4 ขั้นตอน</h2><ol className={styles.steps}>{["เลือกแพ็กเกจและแจ้งว่ามีเว็บไซต์แล้วหรือไม่", "ยืนยันโดเมน ขอบเขตบริการ สัญญา และค่าใช้จ่าย", "ชำระค่าบริการตามรายละเอียดที่ได้รับยืนยัน", "ทีมงานตั้งค่าและตรวจสอบร่วมกันก่อนเปิดใช้งาน"].map((step, index) => <li key={step}><span>0{index + 1}</span>{step}</li>)}</ol></section>

        <section id="terms" className={styles.section}><p className={styles.eyebrow}>04 / SERVICE DETAILS</p><h2>เงื่อนไขที่ควรทราบก่อนสมัคร</h2>
          <div className={styles.terms}>
            <details open><summary>ระยะสัญญาและสิทธิ์รับชม</summary><p>โปรโมชั่นแรกเข้าสำหรับสัญญาขั้นต่ำ 3 เดือน สิทธิ์เข้าถึงข้อมูลและรับชมวิดีโอครอบคลุมเฉพาะประเภทบริการที่สมัครและระยะเวลาที่มีสิทธิ์ตามสัญญา เมื่อสิทธิ์สิ้นสุด การเข้าถึงบริการคอนเทนต์จะสิ้นสุดตามข้อตกลง ให้เจ้าหน้าที่ยืนยันวันเริ่มต้น วันสิ้นสุด และเงื่อนไขการต่ออายุก่อนชำระเงิน</p></details>
            <details><summary>โดเมนฟรีและการรับโอนโดเมน</summary><p>คุณเลือกชื่อโดเมนใหม่ได้ตามชื่อที่ยังว่างและเงื่อนไขโปรโมชั่น โดยผู้ให้บริการเป็นผู้จดและถือครองโดเมน เมื่อครบสัญญา หากต้องการรับโอนโดเมน จะมีค่าบริการเพิ่มเติม โปรดขอรายละเอียดวงเงินจดฟรี ค่าต่ออายุ และเงื่อนไขพร้อมค่ารับโอนก่อนสมัคร</p></details>
            <details><summary>เว็บไซต์ใหม่และการยกเลิกบริการ</summary><p>บริการเป็นการให้ใช้งานเว็บไซต์ ไม่รวมการส่งมอบไฟล์เว็บไซต์หรือฐานข้อมูลเมื่อยกเลิก หากต้องการซื้อเว็บไซต์ต่อ สามารถขอประเมินราคาและขอบเขตการส่งมอบแยกต่างหาก การซื้อเว็บไซต์ไม่รวมสิทธิ์คอนเทนต์หรือ API โดยอัตโนมัติ</p></details>
            <details><summary>ใช้เว็บไซต์ โดเมน และโฮสติ้งของตัวเองได้หรือไม่?</summary><p>ได้ ทีมงานจะตรวจสอบความเข้ากันได้และติดตั้งการเชื่อมต่อให้กับ WordPress ของคุณ โดยไม่คิดค่าโฮสติ้งของเรา เว็บไซต์ โดเมน โฮสติ้ง และข้อมูลเดิมยังเป็นของคุณ ส่วนสิทธิ์ใช้ข้อมูลและคอนเทนต์จากเราขึ้นอยู่กับสัญญาบริการ</p></details>
            <details><summary>มีค่าใช้จ่ายอะไรที่ต้องยืนยันเพิ่มเติม?</summary><p>ก่อนชำระเงิน เจ้าหน้าที่จะยืนยันยอดสุทธิ ภาษีที่เกี่ยวข้อง รอบชำระเงิน ขอบเขตโฮสติ้งและการรับชม ค่าโดเมนหลังโปรโมชั่น ตัวเลือกเสริม และงานนอกขอบเขต พร้อมเงื่อนไขการยกเลิกและคืนเงิน โปรดตรวจสอบรายละเอียดให้ครบถ้วนก่อนยืนยันสมัคร</p></details>
          </div>
        </section>
        <section className={styles.closing}><p className={styles.eyebrow}>LET’S START YOUR WEBSITE</p><h2>เลือกบริการที่ใช่ แล้วให้เราช่วยดูแลการเริ่มต้น</h2><p>แจ้งแพ็กเกจที่สนใจและเว็บไซต์ของคุณ เจ้าหน้าที่จะช่วยสรุปรายละเอียดก่อนสมัคร</p><Contact>ติดต่อ @thaitubevideo ผ่าน Telegram</Contact></section>
      </main>
      <footer className={styles.footer}><Link href="/">AURUM · กลับหน้าแรก</Link><span>เว็บไซต์ · คอนเทนต์ · ระบบโฆษณา</span></footer>
    </div>
  );
}
