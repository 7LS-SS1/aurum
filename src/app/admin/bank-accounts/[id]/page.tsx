import { requireMinRole } from "@/lib/authz";
import { BankAccounts } from "@/components/payments/BankAccounts";
export const dynamic = "force-dynamic";
export default async function Page({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireMinRole("MANAGER");
  return <BankAccounts id={(await params).id} />;
}
