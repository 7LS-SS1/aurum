import { NextRequest } from "next/server";
import { apiError, jsonOk } from "@/lib/api-response";
import { getViewerFromRequest } from "@/lib/viewer-auth";

export async function GET(req: NextRequest) {
  try {
    const viewer = await getViewerFromRequest(req);
    return jsonOk({ viewer });
  } catch (err) {
    return apiError(err);
  }
}
