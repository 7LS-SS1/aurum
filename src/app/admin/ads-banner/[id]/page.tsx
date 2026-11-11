import { auth } from "@/auth";
import { redirect } from "next/navigation";
import { can } from "@/lib/permissions";
import { WebsiteAdsManager } from "@/components/admin/WebsiteAdsManager";
export default async function Page({params}:{params:Promise<{id:string}>}){
 const session=await auth();if(!session?.user)redirect("/admin/login");
 if(!can(session.user.role,"service:manage"))return <p>ไม่มีสิทธิ์จัดการโฆษณา</p>;
 return <WebsiteAdsManager id={(await params).id}/>;
}
