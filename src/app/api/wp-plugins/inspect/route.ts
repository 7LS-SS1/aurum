import { NextRequest } from "next/server";
import { apiError, jsonOk } from "@/lib/api-response";
import { requireMinRole } from "@/lib/authz";
import { wordpressPluginInspectSchema } from "@/lib/validation";
import { inspectWordpressPluginPackage } from "@/lib/wordpress-plugin-package";

export async function POST(req: NextRequest) {
  try {
    await requireMinRole("HEAD");
    const { packageUrl } = wordpressPluginInspectSchema.parse(await req.json());
    return jsonOk(await inspectWordpressPluginPackage(packageUrl));
  } catch (err) {
    return apiError(err);
  }
}
