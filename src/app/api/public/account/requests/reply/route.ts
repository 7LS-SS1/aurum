import { NextRequest } from "next/server";
import { requireViewerFromRequest } from "@/lib/viewer-auth";
import { requireMinRole, type Actor } from "@/lib/authz";
import { apiError, ApiError, jsonOk } from "@/lib/api-response";
import { replyToTicket, ticketReplySchema } from "@/lib/ads-notifications";
import { readServicePageBody, servicePageOriginAllowed } from "@/lib/service-page-request";
import { rateLimit } from "@/lib/rate-limit";
export async function POST(req: NextRequest) {
  try {
    if(!servicePageOriginAllowed(req.headers.get("origin"),req.url)) throw new ApiError("invalid_origin",403);
    const identity: {actor:Actor}|{viewerId:string}=req.nextUrl.searchParams.get("admin")==="1"?{actor:await requireMinRole("MANAGER")}:{viewerId:(await requireViewerFromRequest(req)).id};
    const key="actor" in identity?identity.actor.id:identity.viewerId;
    if(!(await rateLimit(`ticket-reply:${key}`,{limit:30,windowMs:3600000})).success)throw new ApiError("rate_limited",429);
    return jsonOk(await replyToTicket(ticketReplySchema.parse(await readServicePageBody(req)),identity));
  }catch(error){return apiError(error);}
}
