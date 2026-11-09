import Link from "next/link";
import { getViewerFromCookies } from "@/lib/viewer-auth";
import { ViewerMenu } from "./ViewerMenu";
import { ServiceNav } from "./ServiceNav";
import styles from "./Member.module.css";
import { MemberWorkspace } from "./MemberWorkspace";
export async function ServiceHeader() {
  const viewer = await getViewerFromCookies();
  return <><a href="#page-content" className={styles.skip}>ข้ามไปเนื้อหา</a><header className={styles.header}>
    <Link href="/" className={styles.brand}>AURUM<span>MEMBERS & SERVICES</span></Link>
    <ServiceNav />
    <ViewerMenu viewer={viewer} />
  </header></>;
}
export function ServiceFooter() {
  return <footer className={styles.footer}><div className={styles.assurance}><div><strong>ตรวจสอบก่อนยืนยัน</strong><p>ดูบริการ ราคา และระยะเวลาให้ครบก่อนส่งคำสั่งซื้อ</p></div><div><strong>ติดตามรายการได้</strong><p>ดูสถานะและประวัติคำสั่งซื้อจากบัญชีของคุณ</p></div><div><strong>ติดต่อทีมงานโดยตรง</strong><p>สอบถามผ่าน Telegram: @thaitubevideo</p></div></div><Link href="/">AURUM</Link><span>บริการเว็บไซต์และพื้นที่โฆษณา</span><Link href="/services#terms">เงื่อนไข Website API</Link><Link href="/services/help">การสั่งซื้อและข้อมูลส่วนตัว</Link><a href="https://t.me/thaitubevideo" target="_blank" rel="noopener noreferrer">ติดต่อทีมงาน ↗</a></footer>;
}
export async function MemberShell({ children }: { children: React.ReactNode }) {
  const viewer = await getViewerFromCookies();
  return <MemberWorkspace viewer={viewer} footer={<ServiceFooter />}>{children}</MemberWorkspace>;
}
