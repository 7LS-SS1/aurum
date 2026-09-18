import { auth } from "@/auth";
import { can } from "@/lib/permissions";
import { redirect } from "next/navigation";
import { DistributionRepairManager } from "@/components/admin/DistributionRepairManager";

export default async function DistributionRepairPage() {
  const session = await auth();
  if (!session?.user) redirect("/admin/login");
  if (!can(session.user.role, "movie:publish")) redirect("/admin");
  return <DistributionRepairManager />;
}
