import { z } from "zod";
import type { Prisma } from "@prisma/client";
const https = z.string().url().max(2000).refine(v => { const u=new URL(v);return u.protocol==="https:"&&!u.username&&!u.password; }, "ใช้ URL HTTPS");
export const manualAdSchema=z.object({slot:z.string().max(60),title:z.string().trim().min(1).max(120),url:https,targetUrl:https,startsAt:z.string().datetime(),endsAt:z.string().datetime(),enabled:z.boolean()}).strict().refine(v=>Date.parse(v.endsAt)>Date.parse(v.startsAt),"วันสิ้นสุดต้องหลังวันเริ่มต้น");
export type ManualAd=z.infer<typeof manualAdSchema>;
export const manualAdsSchema=z.array(manualAdSchema).max(39).refine(rows=>new Set(rows.map(r=>r.slot)).size===rows.length,"ตำแหน่งซ้ำ");
export function manualReserved(ad:ManualAd,now=Date.now()){return ad.enabled&&Date.parse(ad.endsAt)>now;}
export function manualServing(ad:ManualAd,now=Date.now()){return manualReserved(ad,now)&&Date.parse(ad.startsAt)<=now;}
export async function readManualAds(tx:Prisma.TransactionClient,websiteId:string){
 const row=await tx.servicePageConfig.findUnique({where:{id:`manual-ads:${websiteId}`}});
 return {revision:row?.revision??0,ads:manualAdsSchema.parse(row?.config??[])};
}
export async function manualOccupiedSlots(tx:Prisma.TransactionClient,websiteId?:string){
 const rows=websiteId?[(await readManualAds(tx,websiteId)).ads]:(await tx.servicePageConfig.findMany({where:{id:{startsWith:"manual-ads:"}}})).map(row=>manualAdsSchema.parse(row.config));
 return rows.flat().filter(a=>manualReserved(a)).map(a=>a.slot);
}
