import { NextRequest } from "next/server";
import { requireMinRole } from "@/lib/authz";
import { apiError, jsonOk } from "@/lib/api-response";
import { adsPageUpdateSchema } from "@/lib/ads-page-config";
import { getAdsPage, saveAdsPage } from "@/lib/ads-page-store";
import { readServicePageBody, servicePageOriginAllowed } from "@/lib/service-page-request";

export async function GET() {
  try {
    await requireMinRole("MANAGER");
    return jsonOk(await getAdsPage());
  } catch (error) { return apiError(error); }
}

export async function PUT(request: NextRequest) {
  try {
    const actor = await requireMinRole("MANAGER");
    if (!servicePageOriginAllowed(request.headers.get("origin"), request.url)) return jsonOk({ error: "invalid_origin" }, 403);
    const body = await readServicePageBody(request);
    const { config, revision } = adsPageUpdateSchema.parse(body);
    return jsonOk(await saveAdsPage(config, revision, actor));
  } catch (error) { return apiError(error); }
}
