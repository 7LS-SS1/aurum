import { redirect } from "next/navigation";
import { getViewerFromCookies } from "@/lib/viewer-auth";
import { MemberShell } from "@/components/public/ServiceChrome";
import { MemberOrders } from "@/components/public/MemberOrders";
import { prisma } from "@/lib/prisma";
export const dynamic = "force-dynamic";
export const metadata = { title: "บัญชีและคำสั่งซื้อ | AURUM", robots: { index: false, follow: false } };
export default async function AccountPage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const { tab } = await searchParams;
  const viewer = await getViewerFromCookies();
  if (!viewer) redirect(`/login?callbackUrl=${encodeURIComponent(tab === "profile" ? "/account?tab=profile" : "/account")}`);
  const hasPassword = !!await prisma.viewer.count({ where: { id: viewer.id, passwordHash: { not: null } } });
  return <MemberShell><MemberOrders viewer={viewer} hasPassword={hasPassword} /></MemberShell>;
}
