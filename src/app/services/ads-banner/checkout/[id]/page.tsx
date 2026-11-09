import { OrderFulfillment } from "@/components/services/OrderFulfillment";
import { OrderArtwork } from "@/components/services/OrderArtwork";
import { notFound, redirect } from "next/navigation";
import { z } from "zod";
import { getViewerFromCookies } from "@/lib/viewer-auth";
import { simulationEnabled } from "@/lib/ads-simulation-server";
import { prisma } from "@/lib/prisma";
import { getSimulation } from "@/lib/ads-simulation";
import { PromptPayCheckout } from "@/components/services/PromptPayCheckout";
import { SimulatedCheckout } from "@/components/services/SimulatedCheckout";

export const dynamic = "force-dynamic";
export const metadata = { title: "ชำระเงินและติดตามคำสั่งซื้อ | AURUM", robots: { index: false, follow: false } };
export default async function CheckoutPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!z.string().uuid().safeParse(id).success) notFound();
  const viewer = await getViewerFromCookies();
  if (!viewer) redirect(`/login?callbackUrl=${encodeURIComponent(`/services/ads-banner/checkout/${id}`)}`);
  const order = await prisma.adsOrder.findFirst({ where: { id, viewerId: viewer.id }, select: { quote: true } });
  if (!order) notFound();
  if (getSimulation(order.quote)) {
    if (!simulationEnabled()) notFound();
    return <><SimulatedCheckout id={id} /><div className="ui-panel" style={{maxWidth:1000,margin:"2rem auto"}}><a href={`/account/orders/${id}/summary`}>สรุปคำสั่งซื้อ / พิมพ์ PDF</a><OrderFulfillment id={id}/><OrderArtwork id={id}/></div></>;
  }
  return <><PromptPayCheckout id={id} /><div className="ui-panel" style={{maxWidth:1000,margin:"2rem auto"}}><a href={`/account/orders/${id}/summary`}>สรุปคำสั่งซื้อ / พิมพ์ PDF</a><OrderFulfillment id={id}/><OrderArtwork id={id}/></div></>;
}
