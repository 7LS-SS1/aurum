import { auth } from "@/auth";
import { redirect } from "next/navigation";
import { can } from "@/lib/permissions";
import { getServicePage } from "@/lib/service-page-store";
import { ServicePageManager } from "@/components/admin/ServicePageManager";

export default async function AdminServicesPage() {
  const session = await auth();
  if (!session?.user) redirect("/admin/login");
  if (!can(session.user.role, "service:manage")) return <section><h1>ไม่มีสิทธิ์จัดการหน้าบริการ</h1><p>สำหรับผู้จัดการและหัวหน้าฝ่ายเท่านั้น</p></section>;
  return <section><div className="page-head"><h1>จัดการหน้าบริการ</h1><p>ปรับราคา แพ็กเกจ โปรโมชั่น เงื่อนไข และช่องทางติดต่อของหน้า /services</p></div><ServicePageManager initial={await getServicePage()} /></section>;
}
