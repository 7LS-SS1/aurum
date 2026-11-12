import { requireMinRole } from "@/lib/authz";
import { BankAccounts } from "@/components/payments/BankAccounts";
export const dynamic = "force-dynamic";
export default async function Page() {
  await requireMinRole("MANAGER");
  return <BankAccounts create />;
}
