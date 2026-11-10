import { auth } from "@/auth";
import { redirect } from "next/navigation";
import { can } from "@/lib/permissions";
import { getAdsPage } from "@/lib/ads-page-store";
import { AdsPageManager } from "@/components/admin/AdsPageManager";
import { prisma } from "@/lib/prisma";

export default async function AdminAdsBannerPage() {
  const session = await auth();
  if (!session?.user) redirect("/admin/login");
  if (!can(session.user.role, "service:manage")) return <section><h1>ไม่มีสิทธิ์จัดการ Ads Banner และโปรโมชั่น</h1><p>สำหรับผู้จัดการและหัวหน้าฝ่ายเท่านั้น</p></section>;
  const [initial, targetSites] = await Promise.all([
    getAdsPage(),
    prisma.targetSite.findMany({ select: { id: true, name: true, baseUrl: true, isActive: true }, orderBy: { name: "asc" } }),
  ]);
  return <section><AdsPageManager initial={initial} targetSites={targetSites} /></section>;
}
