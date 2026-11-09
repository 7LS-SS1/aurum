import { auth } from "@/auth";
import { redirect, notFound } from "next/navigation";
import { z } from "zod";
import { can } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { isOrderGroup } from "@/lib/ads-order-groups";
import { AdsOrderDetail } from "@/components/admin/AdsOrderDetail";

export default async function AdsOrderPage({ params, searchParams }: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ group?: string; q?: string }>;
}) {
  const session = await auth();
  if (!session?.user) redirect("/admin/login");
  if (!can(session.user.role, "service:manage")) return <p>ไม่มีสิทธิ์จัดการคำสั่งซื้อ</p>;
  const { id } = await params;
  if (!z.string().uuid().safeParse(id).success) notFound();
  if (!await prisma.adsOrder.findUnique({ where: { id }, select: { id: true } })) notFound();
  const { group, q } = await searchParams;
  const back = new URLSearchParams({ group: typeof group === "string" && isOrderGroup(group) ? group : "all" });
  if (typeof q === "string" && q.trim()) back.set("q", q.trim().slice(0, 100));
  return <AdsOrderDetail id={id} backHref={`/admin/ads-orders?${back}`} />;
}
