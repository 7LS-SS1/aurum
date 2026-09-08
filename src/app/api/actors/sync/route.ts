import { z } from "zod";
import { requireMinRole } from "@/lib/authz";
import { rateLimit } from "@/lib/rate-limit";
import { ApiError, apiError, jsonOk } from "@/lib/api-response";
import { checkActorDestination, syncActorToSite } from "@/lib/actor-sync";
import { can } from "@/lib/permissions";

export const maxDuration = 600;
const inputSchema = z.object({
  siteId: z.string().cuid(),
  actorIds: z.array(z.string().cuid()).min(1).max(5),
  mode: z.enum(["upsert", "create_only"]).default("upsert"),
}).strict();
export async function GET(req: Request) {
  try {
    const user = await requireMinRole("STAFF");
    if (!can(user.role, "actor:push")) throw new ApiError("forbidden", 403);
    if (process.env.ACTOR_SYNC_ENABLED === "false") throw new ApiError("ยังไม่เปิดใช้งานการส่งนักแสดง", 503);
    const siteId = z.string().cuid().parse(new URL(req.url).searchParams.get("siteId"));
    const limit = await rateLimit("actor-sync:check:" + user.id, { limit: 20, windowMs: 60_000 });
    if (!limit.success) throw new ApiError("ตรวจถี่เกินไป กรุณารอหนึ่งนาที", 429);
    await checkActorDestination(siteId);
    return jsonOk({ ready: true }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) { return apiError(error); }
}
export async function POST(req: Request) {
  try {
    const user = await requireMinRole("STAFF");
    if (!can(user.role, "actor:push")) throw new ApiError("forbidden", 403);
    // Optional deployment kill switch; role authorization is enforced independently.
    if (process.env.ACTOR_SYNC_ENABLED === "false") throw new ApiError("ยังไม่เปิดใช้งานการส่งนักแสดง", 503);
    const { siteId, actorIds, mode } = inputSchema.parse(await req.json());
    const ids = [...new Set(actorIds)];
    const limits = await Promise.all(ids.flatMap(() => [
      rateLimit("actor-sync:user:" + user.id, { limit: 60, windowMs: 60_000 }),
      rateLimit("actor-sync:site:" + siteId, { limit: 60, windowMs: 60_000 }),
    ]));
    if (limits.some(limit => !limit.success)) throw new ApiError("ส่งถี่เกินไป กรุณารอหนึ่งนาทีแล้วลองใหม่", 429);
    const results = [];
    for (const actorId of ids) {
      try { results.push(await syncActorToSite(actorId, siteId, user, { createOnly: mode === "create_only" })); }
      catch { results.push({ actorId, siteId, status: "failed", message: "บันทึกประวัติไม่สำเร็จ กรุณาตรวจสอบก่อนลองใหม่" }); }
    }
    return jsonOk({ results });
  } catch (error) { return apiError(error); }
}
