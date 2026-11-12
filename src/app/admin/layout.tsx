import { AdminNotificationBell } from "@/components/admin/AdminNotificationBell";
import { AdminWorkspace } from "@/components/admin/AdminWorkspace";
import { MonitorNav } from "@/components/admin/MonitorPanel";
import Link from "next/link";
import { auth, signOut } from "@/auth";
import { AdminComicMenu } from "@/components/admin/AdminComicMenu";
import { AdminVideoMenu } from "@/components/admin/AdminVideoMenu";
import { can } from "@/lib/permissions";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();

  const role = session?.user?.role;

  if (!session?.user) return <main>{children}</main>;

  return (
    <AdminWorkspace publicOrigin={process.env.PUBLIC_APP_ORIGIN} notifications={role && can(role, "service:manage") ? <AdminNotificationBell /> : null} name={session?.user?.name || "ทีมงาน"} role={role || "GUEST"} account={<form action={async()=>{"use server";await signOut({redirectTo:"/admin/login"});}}><button className="ui-button ui-button--quiet">ออกจากระบบ</button></form>} navigation={<>        <div className="side-sec">
          <div className="side-cat">Dashboard</div>
          <Link className="side-link" href="/admin">
            ภาพรวมระบบ
          </Link>
        </div>
        {role && can(role, "site:manage") && <div className="side-sec"><MonitorNav /></div>}
        <AdminVideoMenu canCreate={Boolean(role && can(role, "movie:create"))} />
        <AdminComicMenu />
        {role && can(role, "service:manage") && (
          <div className="side-sec"><div className="side-cat">ลูกค้า</div><Link className="side-link" href="/admin/members">สมาชิกและลูกค้า</Link></div>
        )}
        {role && can(role, "service:manage") && (
          <>
            <div className="side-sec">
              <div className="side-cat">จัดการบริการ</div>
              <Link className="side-link" href="/admin/services">จัดการหน้าบริการ</Link>
              <Link className="side-link" href="/admin/ads-banner">Ads Banner และโปรโมชั่น</Link>
            </div>
            <div className="side-sec">
              <div className="side-cat">คำขอและคำสั่งซื้อ</div>
              <Link className="side-link" href="/admin/website-services">คำขอ Website API</Link>
              <Link className="side-link" href="/admin/ads-orders">คำสั่งซื้อโฆษณา</Link>
              <nav aria-label="สถานะคำสั่งซื้อโฆษณา" className="orders-subnav">
                <Link href="/admin/ads-orders?group=pending">รอดำเนินการ</Link>
                <Link href="/admin/ads-orders?group=approved">บริการที่อนุมัติแล้ว</Link>
                <Link href="/admin/ads-orders?group=cancelled">ยกเลิก / ไม่อนุมัติ</Link>
              </nav>
            </div>
            <div className="side-sec">
              <div className="side-cat">จัดการบัญชี</div>
              <Link className="side-link" href="/admin/bank-accounts">บัญชีทั้งหมด</Link>
              <Link className="side-link" href="/admin/bank-accounts/new">เพิ่มบัญชีใหม่</Link>
              <Link className="side-link" href="/admin/payments">การชำระเงิน Stripe</Link>
            </div>
            <div className="side-sec">
              <div className="side-cat">ติดตามงานและแจ้งเตือน</div>
              <Link className="side-link" href="/admin/upcoming">เครื่องมือธุรกิจ · เร็ว ๆ นี้</Link>
              <Link className="side-link" href="/admin/service-operations">ศูนย์ปฏิบัติการบริการ</Link>
              <Link className="side-link" href="/admin/notifications">ศูนย์แจ้งเตือน</Link>
            </div>
          </>
        )}
        <div className="side-sec">
          <div className="side-cat">ระบบกระจายเนื้อหา</div>
          {role && can(role, "service:manage") && <Link className="side-link" href="/admin/analytics">สถิติเครือข่ายเว็บไซต์</Link>}
          <Link className="side-link" href="/admin/sites">
            เว็บปลายทาง
          </Link>
          <Link className="side-link" href="/admin/player">
            Media Player
          </Link>
          {role && can(role, "content-generation:view") && (
            <Link className="side-link" href="/admin/content-generation">
              AI Content Queue
            </Link>
          )}
          {role === "HEAD" && <Link className="side-link" href="/admin/content-ai">ตั้งค่า AI วิดีโอ</Link>}
          <Link className="side-link" href="/admin/wp-theme">
            WordPress Assets
          </Link>
        </div>
        {role && can(role, "audit:view") && (
          <div className="side-sec">
            <div className="side-cat">ระบบ</div>
            {can(role, "user:manage") && (
              <Link className="side-link" href="/admin/users">
                จัดการผู้ใช้
              </Link>
            )}
            <Link className="side-link" href="/admin/audit">
              Audit Log
            </Link>
          </div>
        )}

    </>}>{children}</AdminWorkspace>
  );
}
