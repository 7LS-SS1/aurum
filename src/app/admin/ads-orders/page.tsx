import { auth } from "@/auth";
import { redirect } from "next/navigation";
import { can } from "@/lib/permissions";
import { AdsOrdersManager } from "@/components/admin/AdsOrdersManager";
import { isOrderGroup } from "@/lib/ads-order-groups";
export default async function AdsOrdersPage({searchParams}:{searchParams:Promise<{group?:string;q?:string}>}) {
  const session = await auth();
  if (!session?.user) redirect("/admin/login");
  if (!can(session.user.role, "service:manage")) return <p>ไม่มีสิทธิ์จัดการคำสั่งซื้อ</p>;
  const {group="all",q=""}=await searchParams;
  const query=typeof q==="string"?q.trim().slice(0,100):"";
  const selected=isOrderGroup(group)?group:"all";
  return <AdsOrdersManager key={`${selected}:${query}`} group={selected} query={query} />;
}
