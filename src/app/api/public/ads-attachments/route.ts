import { NextRequest } from "next/server";
import { requireViewerFromRequest, getViewerFromRequest } from "@/lib/viewer-auth";
import { requireMinRole } from "@/lib/authz";
import { saveAttachment, readAttachment, attachmentBytes } from "@/lib/ads-attachments";
import { servicePageOriginAllowed } from "@/lib/service-page-request";
import { apiError, jsonOk, ApiError } from "@/lib/api-response";
import { rateLimit } from "@/lib/rate-limit";
export const runtime = "nodejs";
export async function POST(req: NextRequest) {
  try {
    const viewer=await requireViewerFromRequest(req);
    if (!servicePageOriginAllowed(req.headers.get("origin"),req.url)) throw new ApiError("invalid_origin",403);
    if (!(await rateLimit("ads-files:"+viewer.id,{limit:80,windowMs:3600000})).success) throw new ApiError("rate_limited",429);
    const file=await saveAttachment(req,viewer.id);
    return jsonOk({id:file.id,name:file.name,type:file.type,size:file.size});
  } catch(error){return apiError(error);}
}
export async function GET(req: NextRequest) {
  try {
    const file=await readAttachment(req.nextUrl.searchParams.get("id") || "");
    const viewer=await getViewerFromRequest(req);
    if (viewer?.id!==file.owner) await requireMinRole("MANAGER");
    const disposition = req.nextUrl.searchParams.get("preview") === "1" ? "inline" : "attachment";
    return new Response(new Uint8Array(await attachmentBytes(file.id)),{headers:{"Content-Type":file.type,"Content-Disposition":disposition+"; filename*=UTF-8''"+encodeURIComponent(file.name),"Cache-Control":"private, no-store","X-Content-Type-Options":"nosniff"}});
  } catch(error){return apiError(error);}
}
