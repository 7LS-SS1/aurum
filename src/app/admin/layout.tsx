import Link from "next/link";
import { auth, signOut } from "@/auth";
import { can } from "@/lib/permissions";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();
  const initial = session?.user?.name?.charAt(0) || session?.user?.email?.charAt(0) || "A";
  const role = session?.user?.role;

  return (
    <>
      <header className="topbar">
        <div className="tb-left">
          <div className="logo">
            <span className="mark">
              <span>A</span>
            </span>
            <span className="word">AURUM</span>
            <span className="admin-tag">ADMIN</span>
          </div>
        </div>
        <div className="tb-spacer" />
        <div className="env-pill">
          <span className="dot" />
          <span>{session?.user?.role ?? ""}</span>
        </div>
        <form
          action={async () => {
            "use server";
            await signOut({ redirectTo: "/admin/login" });
          }}
        >
          <button className="btn-ghost" style={{ padding: "8px 14px", borderRadius: 8, fontSize: 13 }}>
            ออกจากระบบ
          </button>
        </form>
        <div className="avatar">{initial.toUpperCase()}</div>
      </header>

      <aside className="sidebar">
        <div className="side-sec">
          <div className="side-cat">Dashboard</div>
          <Link className="side-link" href="/admin">
            Backend Dashboard
          </Link>
        </div>
        <div className="side-sec">
          <div className="side-cat">เนื้อหา</div>
          <Link className="side-link" href="/admin/videos">
            วิดีโอทั้งหมด
          </Link>
          {role && can(role, "movie:create") && (
            <Link className="side-link" href="/admin/videos/new">
              เพิ่มวิดีโอใหม่
            </Link>
          )}
          {role && can(role, "upload:quick-publish") && (
            <Link className="side-link" href="/admin/upload">
              อัปโหลดด่วน (เผยแพร่ทันที)
            </Link>
          )}
        </div>
        <div className="side-sec">
          <div className="side-cat">ระบบกระจายเนื้อหา</div>
          <Link className="side-link" href="/admin/sites">
            เว็บปลายทาง
          </Link>
          <Link className="side-link" href="/admin/player">
            Media Player
          </Link>
        </div>
        {role && can(role, "audit:view") && (
          <div className="side-sec">
            <div className="side-cat">ระบบ</div>
            <Link className="side-link" href="/admin/audit">
              Audit Log
            </Link>
          </div>
        )}
      </aside>

      <main className="main">{children}</main>
    </>
  );
}
