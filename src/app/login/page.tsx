import Link from "next/link";
import { MemberShell } from "@/components/public/ServiceChrome";
import { MemberAuth } from "@/components/public/MemberAuth";
import { safeMemberReturn } from "@/lib/member-validation";
import styles from "@/components/public/Member.module.css";
export const metadata = { title: "เข้าสู่ระบบ | AURUM", robots: { index: false, follow: false } };
export default async function Page({ searchParams }: { searchParams: Promise<{ callbackUrl?: string }> }) {
 const params=await searchParams; const callbackUrl=safeMemberReturn(params.callbackUrl || "/account");
 return <MemberShell><main className={styles.auth}><section className={styles.intro}><small>AURUM MEMBERSHIP</small><h1>บัญชีเดียว<br />ดูแลทุกบริการของคุณ</h1><p>เลือกบริการ ติดตามคำสั่งซื้อ และรับผลการดำเนินงานจากทีมงานได้ในพื้นที่สมาชิก</p><ul><li>เลือกพื้นที่โฆษณาได้หลายช่องและหลายหน้า</li><li>ตรวจยอดชำระและวันเริ่ม–สิ้นสุดบริการ</li><li>ดูประวัติคำสั่งซื้อในบัญชีของคุณ</li></ul></section><section className={styles.card}><h2>ยินดีต้อนรับกลับ</h2><p className={styles.hint}>เข้าสู่ระบบเพื่อจัดการบริการและคำสั่งซื้อ</p><MemberAuth register={false} callbackUrl={callbackUrl} /><p className={styles.hint}>ยังไม่มีบัญชี? <Link href={`/register?callbackUrl=${encodeURIComponent(callbackUrl)}`}>สมัครสมาชิก</Link></p></section></main></MemberShell>;
}
