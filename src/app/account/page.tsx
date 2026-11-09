import { redirect } from "next/navigation";
import { getViewerFromCookies } from "@/lib/viewer-auth";
import { MemberShell } from "@/components/public/ServiceChrome";
import { MemberOrders } from "@/components/public/MemberOrders";
export const dynamic = "force-dynamic";
export const metadata = { title: "บัญชีและคำสั่งซื้อ | AURUM", robots: { index: false, follow: false } };
export default async function AccountPage() {
  const viewer = await getViewerFromCookies();
  if (!viewer) redirect("/login?callbackUrl=%2Faccount");
  return <MemberShell><MemberOrders viewer={viewer} /></MemberShell>;
}
