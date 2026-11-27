import { requireMinRole } from "@/lib/authz";
import { VideoSourcesManager } from "@/components/admin/VideoSourcesManager";
export const dynamic = "force-dynamic";
export default async function Page() {
  const actor = await requireMinRole("STAFF");
  return <VideoSourcesManager mode="list" canManage={actor.role === "HEAD" || actor.role === "MANAGER"} />;
}
