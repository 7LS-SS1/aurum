import { redirect } from "next/navigation";
import { getViewerFromCookies } from "@/lib/viewer-auth";
import { MemberShell } from "@/components/public/ServiceChrome";
import { MemberBankPayments } from "@/components/payments/MemberBankPayments";
import { StripeBilling } from "@/components/payments/StripeBilling";
export const dynamic = "force-dynamic";
export const metadata = { title: "การชำระเงิน | AURUM", robots: { index: false, follow: false } };
export default async function PaymentsPage() {
  if (!await getViewerFromCookies()) redirect("/login?callbackUrl=%2Faccount%2Fpayments");
  return <MemberShell><MemberBankPayments/><details className="ui-panel"><summary>ประวัติการชำระเงินผ่านช่องทางเดิม (Stripe)</summary><StripeBilling /></details></MemberShell>;
}
