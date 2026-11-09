import { auth } from "@/auth";
import { redirect } from "next/navigation";
import { can } from "@/lib/permissions";
import { AdsNotifications } from "@/components/admin/AdsNotifications";
export default async function NotificationsPage() {
  const session = await auth();
  if (!session?.user) redirect("/admin/login");
  if (!can(session.user.role, "service:manage")) return <p>ไม่มีสิทธิ์ดูแจ้งเตือนคำสั่งซื้อ</p>;
  return <AdsNotifications />;
}
