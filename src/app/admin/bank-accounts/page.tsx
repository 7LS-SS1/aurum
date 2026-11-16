import { requireMinRole } from "@/lib/authz";
import { BankAccounts } from "@/components/payments/BankAccounts";
import { UsdtWallets } from "@/components/payments/UsdtWallets";
export const dynamic = "force-dynamic";
export default async function Page() {
  await requireMinRole("MANAGER");
  return <><BankAccounts /><UsdtWallets /></>;
}
