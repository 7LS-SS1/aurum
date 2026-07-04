import Link from "next/link";
import { ViewerLoginForm } from "@/components/public/ViewerLoginForm";

export default async function ViewerLoginPage({ searchParams }: { searchParams: Promise<{ callbackUrl?: string }> }) {
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
        <h1>เข้าสู่ระบบ</h1>
        <p>เข้าสู่ระบบเพื่อถูกใจ บันทึกดูภายหลัง และแสดงความคิดเห็น</p>
        <ViewerLoginForm callbackUrl={callbackUrl ?? "/"} />
        <p style={{ marginTop: 16, fontSize: 13.5, color: "var(--muted)" }}>
          ยังไม่มีบัญชี?{" "}
          <Link href={`/register${callbackUrl ? `?callbackUrl=${encodeURIComponent(callbackUrl)}` : ""}`} style={{ color: "var(--gold-bright)" }}>
            สมัครสมาชิก
          </Link>
        </p>
      </div>
    </div>
  );
}
