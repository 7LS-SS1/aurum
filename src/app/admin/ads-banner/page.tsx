import { auth } from "@/auth";
import { redirect } from "next/navigation";
import { can } from "@/lib/permissions";
import { getAdsPage } from "@/lib/ads-page-store";
import { AdsPageManager } from "@/components/admin/AdsPageManager";

export default async function AdminAdsBannerPage() {
  const session = await auth();
  if (!session?.user) redirect("/admin/login");
  if (!can(session.user.role, "service:manage")) return <section><h1>ไม่มีสิทธิ์จัดการ Ads Banner และโปรโมชั่น</h1><p>สำหรับผู้จัดการและหัวหน้าฝ่ายเท่านั้น</p></section>;
  return <section><div className="page-head"><h1>จัดการ Ads Banner และโปรโมชั่น</h1><p>แก้ไขเนื้อหา ราคา และโพสต์โปรโมชั่นบน /services/ads-banner</p></div><AdsPageManager initial={await getAdsPage()} /></section>;
}
