import Link from "next/link";
import { ViewerRegisterForm } from "@/components/public/ViewerRegisterForm";

export default async function ViewerRegisterPage({ searchParams }: { searchParams: Promise<{ callbackUrl?: string }> }) {
  const { callbackUrl } = await searchParams;

  return (
    <div className="auth-wrap">
      <div className="auth-card">
        <div className="logo" style={{ marginBottom: 18 }}>
          <span className="mark">
            <span>A</span>
          </span>
          <span className="word">AURUM</span>
        </div>
        <h1>สมัครสมาชิก</h1>
        <p>สร้างบัญชีเพื่อถูกใจ บันทึกดูภายหลัง และแสดงความคิดเห็น</p>
        <ViewerRegisterForm callbackUrl={callbackUrl ?? "/"} />
        <p style={{ marginTop: 16, fontSize: 13.5, color: "var(--muted)" }}>
          มีบัญชีอยู่แล้ว?{" "}
          <Link href={`/login${callbackUrl ? `?callbackUrl=${encodeURIComponent(callbackUrl)}` : ""}`} style={{ color: "var(--gold-bright)" }}>
            เข้าสู่ระบบ
          </Link>
        </p>
      </div>
    </div>
  );
}
