import { NextRequest } from "next/server";
import { requireMinRole } from "@/lib/authz";
import { apiError, ApiError, jsonOk } from "@/lib/api-response";
import { getAdsPage } from "@/lib/ads-page-store";
import { resolveAdsKey, generateAdsKey } from "@/lib/ads-plugin-keys";
import { prisma } from "@/lib/prisma";
import { z } from "zod";
export async function POST(req:NextRequest,{params}:{params:Promise<{id:string}>}){
 try{
  const actor=await requireMinRole("MANAGER");
  const {id}=await params;z.string().uuid().parse(id);
  const {action}=z.object({action:z.enum(["generate","reveal","status"])}).parse(await req.json());
  const {config}=await getAdsPage();
  if(!config.websites.some(s=>s.id===id))throw new ApiError("website_not_found",404);
  if(action==="status") {
   let configured=false;
   try { await resolveAdsKey(id); configured=true; }
   catch(e) { if(!(e instanceof ApiError && e.status===401)) throw e; }
   return jsonOk({configured},{headers:{"Cache-Control":"no-store, private"}});
  }
  const key=action==="generate"?await generateAdsKey(id,actor):await resolveAdsKey(id);
  if(action==="reveal")await prisma.auditLog.create({data:{actorId:actor.id,actorRole:actor.role,action:"reveal_ads_key",resourceType:"ads_website",resourceId:id}});
  return jsonOk({key},{headers:{"Cache-Control":"no-store, private","Pragma":"no-cache"}});
 }catch(e){return apiError(e);}
}
