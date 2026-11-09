import { requireMinRole } from "@/lib/authz";
import { ServiceOperations } from "@/components/admin/ServiceOperations";
export default async function Page(){await requireMinRole("MANAGER");return <ServiceOperations/>;}
