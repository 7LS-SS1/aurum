import Link from "next/link";
import { auth, signOut } from "@/auth";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();
  const initial = session?.user?.name?.charAt(0) || session?.user?.email?.charAt(0) || "A";

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
          <div className="side-cat">ระบบกระจายเนื้อหา</div>
          <Link className="side-link" href="/admin/upload">
            อัปโหลด &amp; กระจาย
          </Link>
          <Link className="side-link" href="/admin/sites">
            เว็บปลายทาง
          </Link>
        </div>
      </aside>

      <main className="main">{children}</main>
    </>
  );
}
