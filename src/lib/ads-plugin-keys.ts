import { randomBytes } from "node:crypto";
import { prisma } from "./prisma";
import { encrypt, decrypt } from "./crypto";
import { pluginKey } from "./ads-plugin";
import { ApiError } from "./api-response";
import type { Actor } from "./authz";
import { z } from "zod";
const envelope=z.object({ciphertext:z.string(),iv:z.string(),tag:z.string()});
export async function resolveAdsKey(id:string) {
 z.string().uuid().parse(id);
 const row=await prisma.servicePageConfig.findUnique({where:{id:`ads-key:${id}`}});
 return row ? decrypt(envelope.parse(row.config)) : pluginKey(id);
}
export async function generateAdsKey(id:string,actor:Actor) {
 z.string().uuid().parse(id);
 return prisma.$transaction(async tx=>{
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(73421, 1)`;
  const page=await tx.servicePageConfig.findUnique({where:{id:"ads-banner"}});
  const config=page?.config as {websites?:{id:string}[]}|undefined;
  if(!config?.websites?.some(s=>s.id===id))throw new ApiError("website_not_found",404);
  const existing=await tx.servicePageConfig.findUnique({where:{id:`ads-key:${id}`}});
  let legacy=false;try{pluginKey(id);legacy=true;}catch(e){if(!(e instanceof ApiError&&e.status===401))throw e;}
  if(existing||legacy)throw new ApiError("เว็บไซต์นี้มีคีย์แล้ว กรุณาใช้ปุ่มแสดงคีย์",409);
  const key=randomBytes(48).toString("base64url");
  await tx.servicePageConfig.create({data:{id:`ads-key:${id}`,config:{...encrypt(key)},revision:1}});
  await tx.auditLog.create({data:{actorId:actor.id,actorRole:actor.role,action:"generate_ads_key",resourceType:"ads_website",resourceId:id}});
  return key;
 });
}
