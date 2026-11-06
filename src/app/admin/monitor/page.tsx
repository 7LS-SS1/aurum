import { auth } from "@/auth";
import { hasMinRole } from "@/lib/permissions";
import { redirect } from "next/navigation";
import { MonitorPanel } from "@/components/admin/MonitorPanel";
export default async function Page() {
  const session = await auth();
  if (!session?.user) redirect("/admin/login");
  if (!hasMinRole(session.user.role, "MANAGER")) redirect("/admin");
  return <MonitorPanel />;
}
