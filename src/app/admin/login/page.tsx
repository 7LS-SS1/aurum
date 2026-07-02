import { AuthError } from "next-auth";
import { redirect } from "next/navigation";
import { signIn } from "@/auth";

async function loginAction(formData: FormData) {
  "use server";
  const email = String(formData.get("email") ?? "");
  const password = String(formData.get("password") ?? "");
  const callbackUrl = String(formData.get("callbackUrl") || "/admin");

  try {
    await signIn("credentials", { email, password, redirectTo: callbackUrl });
  } catch (err) {
    if (err instanceof AuthError) {
      redirect(`/admin/login?error=invalid&callbackUrl=${encodeURIComponent(callbackUrl)}`);
    }
    throw err;
  }
}

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; callbackUrl?: string }>;
}) {
  const { error, callbackUrl } = await searchParams;

  return (
    <div className="auth-wrap">
      <div className="auth-card">
        <div className="logo" style={{ marginBottom: 18 }}>
          <span className="mark">
            <span>A</span>
          </span>
          <span className="word">AURUM</span>
          <span className="admin-tag">ADMIN</span>
        </div>
        <h1>เข้าสู่ระบบ</h1>
        <p>สำหรับผู้ดูแลระบบ/บรรณาธิการเท่านั้น</p>

        <form action={loginAction}>
          <input type="hidden" name="callbackUrl" value={callbackUrl ?? "/admin"} />
          <div className="field">
            <label>อีเมล</label>
            <input type="email" name="email" required autoComplete="username" />
          </div>
          <div className="field">
            <label>รหัสผ่าน</label>
            <input type="password" name="password" required autoComplete="current-password" />
          </div>
          {error && <p className="error-text">อีเมลหรือรหัสผ่านไม่ถูกต้อง</p>}
          <button className="btn btn-gold btn-block" type="submit" style={{ marginTop: 8 }}>
            เข้าสู่ระบบ
          </button>
        </form>
      </div>
    </div>
  );
}
