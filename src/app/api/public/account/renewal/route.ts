import { NextRequest } from "next/server";
import { z } from "zod";
import { requireViewerFromRequest } from "@/lib/viewer-auth";
import { readRenewalInfo } from "@/lib/ads-orders";
import { apiError, jsonOk } from "@/lib/api-response";
export async function GET(req: NextRequest) {
  try {
    const viewer = await requireViewerFromRequest(req);
    const id = z.string().uuid().parse(req.nextUrl.searchParams.get("id"));
    return jsonOk(await readRenewalInfo(id, viewer.id), { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) { return apiError(error); }
}
