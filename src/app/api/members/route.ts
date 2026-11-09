import { NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireMinRole } from "@/lib/authz";
import { apiError, jsonOk, ApiError } from "@/lib/api-response";
import { readServicePageBody, servicePageOriginAllowed } from "@/lib/service-page-request";

export async function GET(req: NextRequest) {
  try {
    await requireMinRole("MANAGER");
    const q = (req.nextUrl.searchParams.get("q") || "").slice(0, 100);
    const id = req.nextUrl.searchParams.get("id");
    if (id) {
      const member = await prisma.viewer.findUnique({ where: { id }, select: { id:true, displayName:true, email:true, phone:true, phoneVerifiedAt:true, createdAt:true, suspended:true, staffNote:true, adminRevision:true } });
      if (!member) throw new ApiError("not_found",404);
      const [orders, history] = await Promise.all([
        prisma.adsOrder.findMany({where:{viewerId:id},orderBy:{createdAt:"desc"},select:{id:true,status:true,amount:true,days:true,startsAt:true,endsAt:true,createdAt:true,quote:true}}),
        prisma.auditLog.findMany({where:{resourceType:"member",resourceId:id},orderBy:{createdAt:"desc"},take:50,select:{id:true,action:true,createdAt:true,actorRole:true,metadata:true}})
      ]);
      return jsonOk({member,orders,history},{headers:{"Cache-Control":"no-store"}});
    }
    const page = Math.max(1, Math.min(100000, Number(req.nextUrl.searchParams.get("page")) || 1));
    const status = req.nextUrl.searchParams.get("status");
    const where = { ...(status === "suspended" ? {suspended:true}:status === "active"?{suspended:false}:{}), ...(q?{OR:[{displayName:{contains:q,mode:"insensitive" as const}},{email:{contains:q,mode:"insensitive" as const}},{phone:{contains:q}}]}:{}) };
    const [members,total] = await Promise.all([prisma.viewer.findMany({where,skip:(Math.floor(page)-1)*25,take:25,orderBy:[{createdAt:"desc"},{id:"desc"}],select:{id:true,displayName:true,email:true,phone:true,createdAt:true,suspended:true,_count:{select:{orders:true}}}}),prisma.viewer.count({where})]);
    return jsonOk({members,total},{headers:{"Cache-Control":"no-store"}});
  } catch(e){return apiError(e);}
}
export async function PATCH(req:NextRequest){
  try{
    const actor=await requireMinRole("MANAGER");
    if(!servicePageOriginAllowed(req.headers.get("origin"),req.url))throw new ApiError("invalid_origin",403);
    const data=z.object({id:z.string().min(1).max(100),revision:z.number().int().positive(),suspended:z.boolean(),staffNote:z.string().trim().max(4000),reason:z.string().trim().min(3).max(500)}).strict().parse(await readServicePageBody(req));
    await prisma.$transaction(async tx=>{
      const updated=await tx.viewer.updateMany({where:{id:data.id,adminRevision:data.revision},data:{suspended:data.suspended,staffNote:data.staffNote,adminRevision:{increment:1}}});
      if(!updated.count)throw new ApiError("ข้อมูลเปลี่ยนแล้ว กรุณาโหลดใหม่",409);
      if(data.suspended)await tx.viewerSession.deleteMany({where:{viewerId:data.id}});
      await tx.auditLog.create({data:{actorId:actor.id,actorRole:actor.role,action:"member.updated",resourceType:"member",resourceId:data.id,metadata:{reason:data.reason,suspended:data.suspended,revision:data.revision+1}}});
    });
    return jsonOk({ok:true});
  }catch(e){return apiError(e);}
}
