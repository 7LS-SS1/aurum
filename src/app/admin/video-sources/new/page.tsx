import { requireMinRole } from "@/lib/authz";
import { VideoSourcesManager } from "@/components/admin/VideoSourcesManager";
export const dynamic = "force-dynamic";
export default async function Page() {
  const actor = await requireMinRole("MANAGER");
  return <VideoSourcesManager mode="form" canManage={actor.role === "HEAD" || actor.role === "MANAGER"} />;
}
