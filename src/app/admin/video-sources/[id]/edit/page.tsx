import { requireMinRole } from "@/lib/authz";
import { VideoSourcesManager } from "@/components/admin/VideoSourcesManager";
export const dynamic = "force-dynamic";
export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const actor = await requireMinRole("MANAGER");
  const { id } = await params;
  return <VideoSourcesManager mode="form" id={id} canManage={actor.role === "HEAD" || actor.role === "MANAGER"} />;
}
