import { apiError, jsonOk } from "@/lib/api-response";
import { requireMinRole } from "@/lib/authz";
import { drainDownloads } from "@/lib/auto-download";
import { z } from "zod";

export const runtime = "nodejs";
export const maxDuration = 300;

/** Lets staff run the queue immediately instead of waiting for the scheduler. */
export async function POST(req: Request) {
  try {
    await requireMinRole("STAFF");
    const data = req.headers.get("content-type")?.includes("application/json") ? await req.json() : {};
    const { ids } = z.object({ ids: z.array(z.string().min(1).max(64)).min(1).max(100).optional() }).strict().parse(data);
    return jsonOk(await drainDownloads(240_000, ids));
  } catch (error) { return apiError(error); }
}
