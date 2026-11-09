import { requireMinRole } from "@/lib/authz";
import { StripeBilling } from "@/components/payments/StripeBilling";
export const dynamic = "force-dynamic";
export default async function PaymentsPage() {
  await requireMinRole("MANAGER");
  return <StripeBilling admin />;
}
