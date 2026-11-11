import { NextRequest } from "next/server";
import { z } from "zod";
import { requireMinRole } from "@/lib/authz";
import { ApiError,apiError,jsonOk } from "@/lib/api-response";
import { locked,orderWebsite } from "@/lib/ads-orders";
import { getInventory,occupiedPhysicalSlots } from "@/lib/ads-booking";
import { adsPageSchema } from "@/lib/ads-page-config";
import { reservedStatuses } from "@/lib/ads-inventory-status";
import { getSimulation } from "@/lib/ads-simulation";
import { manualAdsSchema,manualReserved,readManualAds } from "@/lib/ads-manual";
import type { Prisma } from "@prisma/client";
async function state(tx:Prisma.TransactionClient,id:string){
 const page=await tx.servicePageConfig.findUnique({where:{id:"ads-banner"}});
 const config=adsPageSchema.parse(page?.config);
 const website=config.websites.find(s=>s.id===id);if(!website)throw new ApiError("website_not_found",404);
 const orders=(await tx.adsOrder.findMany({where:{status:{in:reservedStatuses}},select:{id:true,status:true,slots:true,quote:true,startsAt:true,endsAt:true}})).filter(o=>!getSimulation(o.quote)&&(!orderWebsite(o.quote)||orderWebsite(o.quote)===id));
 return {website,inventory:getInventory(config),orders:orders.map(({quote,...o})=>({...o,legacy:!orderWebsite(quote)})),...await readManualAds(tx,id)};
}
export async function GET(_req:NextRequest,{params}:{params:Promise<{id:string}>}){try{await requireMinRole("MANAGER");const {id}=await params;z.string().uuid().parse(id);return jsonOk(await locked(tx=>state(tx,id)),{headers:{"Cache-Control":"no-store"}});}catch(e){return apiError(e);}}
export async function PUT(req:NextRequest,{params}:{params:Promise<{id:string}>}){try{
 const actor=await requireMinRole("MANAGER");const {id}=await params;z.string().uuid().parse(id);
 const input=z.object({revision:z.number().int().nonnegative(),ads:manualAdsSchema}).strict().parse(await req.json());
 const result=await locked(async tx=>{
  const current=await state(tx,id);if(current.revision!==input.revision)throw new ApiError("ข้อมูลเปลี่ยนแล้ว กรุณาโหลดใหม่",409);
  const occupied=new Set(current.orders.flatMap(o=>occupiedPhysicalSlots(o.slots)));
  if(input.ads.some(a=>!current.inventory.some(s=>s.id===a.slot)))throw new ApiError("invalid_slot",422);
  if(input.ads.some(a=>manualReserved(a)&&occupied.has(a.slot)))throw new ApiError("ตำแหน่งมีคำสั่งซื้อของลูกค้าอยู่ ไม่สามารถลงทับได้",409);
  await tx.servicePageConfig.upsert({where:{id:`manual-ads:${id}`},create:{id:`manual-ads:${id}`,revision:1,config:input.ads},update:{revision:{increment:1},config:input.ads}});
  await tx.auditLog.create({data:{actorId:actor.id,actorRole:actor.role,action:"manage_manual_ads",resourceType:"ads_website",resourceId:id,metadata:{before:current.ads,after:input.ads}}});
  return {revision:current.revision+1};
 });return jsonOk(result);
}catch(e){return apiError(e);}}
