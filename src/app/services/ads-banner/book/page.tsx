import { simulationEnabled } from "@/lib/ads-simulation-server";
import Link from "next/link";
import { AdsBooking } from "@/components/services/AdsBooking";
import { getAdsPage } from "@/lib/ads-page-store";
import { getViewerFromCookies } from "@/lib/viewer-auth";
import { redirect } from "next/navigation";
import { readRenewalInfo } from "@/lib/ads-orders";
import { z } from "zod";
export const dynamic = "force-dynamic";
export const metadata = { title: "เลือกพื้นที่โฆษณา | AURUM", robots: { index: false, follow: false }, referrer: "no-referrer" as const };
export default async function BookingPage({ searchParams }: { searchParams: Promise<{ renew?: string; mode?: string }> }) {
  const params = await searchParams;
  const viewer = await getViewerFromCookies();
  if (!viewer) redirect("/login?callbackUrl=" + encodeURIComponent("/services/ads-banner/book" + (params.renew ? `?renew=${encodeURIComponent(params.renew)}&mode=${params.mode === "same" ? "same" : "change"}` : "")));
  let renewal = null;
  if (params.renew) {
    if (z.string().uuid().safeParse(params.renew).success) {
      try { renewal = await readRenewalInfo(params.renew, viewer.id); } catch { /* inaccessible orders reveal no details */ }
    }
    if (!renewal?.seed) return <main style={{ maxWidth: 900, margin: "40px auto", padding: 24 }}><h1>ยังเปิดรายการต่ออายุนี้ไม่ได้</h1><p>คำสั่งซื้ออาจอยู่นอกช่วงต่ออายุ หรือมีรายการต่ออายุอยู่แล้ว</p><Link href={renewal?.pending ? `/services/ads-banner/checkout/${renewal.pending.id}` : "/account"}>ดูรายการของฉัน →</Link></main>;
  }
  const { config } = await getAdsPage();
  return <main style={{ background: "var(--bg)", minHeight: "100vh" }}><div style={{ maxWidth: 1000, margin: "auto", padding: "24px", color: "#e7c789" }}><Link href="/services/ads-banner">← รายละเอียดบริการ Ads Banner</Link></div><AdsBooking renewal={renewal?.seed ? { ...renewal.seed, mode: params.mode === "same" ? "same" : "change", deadline: renewal.deadline! } : undefined} simulation={simulationEnabled()} config={{ coupons:config.coupons.filter(c=>c.enabled), websites: config.websites.filter(site => site.enabled), groups: config.groups, telegram: config.telegram, packages: config.packages, inventoryCounts: config.inventoryCounts }} /></main>;
}
