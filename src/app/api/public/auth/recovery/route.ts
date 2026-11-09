import { NextRequest } from "next/server";
import { apiError, ApiError, jsonOk } from "@/lib/api-response";
import { actionRequestSchema, requestAccountAction, consumeActionSchema, consumeAccountAction } from "@/lib/account-actions";
import { getViewerFromRequest } from "@/lib/viewer-auth";
import { clientIp, rateLimit } from "@/lib/rate-limit";
import { readServicePageBody, servicePageOriginAllowed } from "@/lib/service-page-request";
import { mailReady } from "@/lib/service-mail";
export async function GET(){return jsonOk({enabled:mailReady()},{headers:{"Cache-Control":"no-store"}});}
async function handle(req:NextRequest,consume:boolean){try{
  if(!servicePageOriginAllowed(req.headers.get("origin"),req.url))throw new ApiError("invalid_origin",403);
  if(!(await rateLimit(`account-action:${clientIp(req)}`,{limit:10,windowMs:3600000})).success)throw new ApiError("rate_limited",429);
  const body=await readServicePageBody(req);
  if(consume)await consumeAccountAction(consumeActionSchema.parse(body));
  else{const input=actionRequestSchema.parse(body);const viewer=await getViewerFromRequest(req);if(input.purpose==="verify"&&!viewer)throw new ApiError("unauthorized",401);await requestAccountAction(input,viewer?.id);}
  return jsonOk({ok:true},{headers:{"Cache-Control":"no-store"}});
}catch(error){return apiError(error);}}
export async function POST(req:NextRequest){return handle(req,false);}
export async function PATCH(req:NextRequest){return handle(req,true);}
