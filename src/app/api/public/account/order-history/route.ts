import { NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getViewerFromRequest } from "@/lib/viewer-auth";
import { requireMinRole } from "@/lib/authz";
import { apiError, jsonOk, ApiError } from "@/lib/api-response";
export async function GET(req: NextRequest) {
  try {
    const id=z.string().uuid().parse(req.nextUrl.searchParams.get("id"));
    const admin=req.nextUrl.searchParams.get("admin")==="1";
    const viewer=admin?null:await getViewerFromRequest(req);
    if(admin) await requireMinRole("MANAGER");
    else if(!viewer) throw new ApiError("unauthorized",401);
    const order=await prisma.adsOrder.findFirst({where:{id,...(!admin?{viewerId:viewer!.id}:{})},select:{createdAt:true,status:true}});
    if(!order)throw new ApiError("not_found",404);
    const logs=await prisma.auditLog.findMany({where:{resourceType:"ads_order",resourceId:id},orderBy:[{createdAt:"asc"},{id:"asc"}],select:{id:true,createdAt:true,action:true,metadata:true,actorRole:true}});
    const events=logs.map(log=>{const data=log.metadata && typeof log.metadata==="object" && !Array.isArray(log.metadata)?log.metadata:{};return {id:log.id,date:log.createdAt,action:log.action,before:typeof data.before==="string"?data.before:null,after:typeof data.after==="string"?data.after:null,note:typeof data.note==="string"?data.note:"",...(admin?{role:log.actorRole,reference:typeof data.reference==="string"?data.reference:null}:{})};});
    return jsonOk({createdAt:order.createdAt,status:order.status,events},{headers:{"Cache-Control":"private, no-store"}});
  } catch(error){return apiError(error);}
}
