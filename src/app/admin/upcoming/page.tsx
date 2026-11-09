import { auth } from "@/auth";
import { can } from "@/lib/permissions";
import { notFound } from "next/navigation";
import { UpcomingTools } from "@/components/admin/UpcomingTools";
export const metadata={title:"เครื่องมือเร็ว ๆ นี้ | AURUM"};
export default async function Page(){const session=await auth();if(!session?.user?.role||!can(session.user.role,"service:manage"))notFound();return <UpcomingTools/>;}
