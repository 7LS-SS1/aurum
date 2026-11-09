import {z} from "zod";
import {normalizeRequestDomain} from "./website-request-domain";
import {createHash} from "node:crypto";
import {prisma} from "./prisma";
import {ApiError} from "./api-response";
import {defaultServicePage,servicePageSchema} from "./service-page-config";
import {customerNotice} from "./customer-notices";
import type {Actor} from "./authz";
export const websiteRequestSchema=z.object({requestId:z.string().uuid(),plan:z.number().int().min(0).max(2),mode:z.enum(["new","existing"]),domain:z.string().trim().transform((value,ctx)=>{const domain=normalizeRequestDomain(value);if(!domain){ctx.addIssue({code:"custom",message:"กรอกชื่อโดเมน เช่น example.test หรือ ทดสอบ.com โดยไม่ใส่ https:// หรือ path"});return z.NEVER;}return domain;}),options:z.array(z.number().int().min(0).max(1)).max(2).refine(v=>new Set(v).size===v.length),contact:z.string().trim().min(3).max(200),note:z.string().trim().max(2000),acceptedTerms:z.literal(true)}).strict();
export async function createWebsiteRequest(input:z.infer<typeof websiteRequestSchema>,viewerId:string){return prisma.$transaction(async tx=>{
 await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${viewerId}), 92)`;
 const requestHash=createHash("sha256").update(JSON.stringify(input)).digest("hex");
 const old=await tx.websiteServiceRequest.findUnique({where:{requestId:input.requestId}});if(old){if(old.viewerId!==viewerId||old.requestHash!==requestHash)throw new ApiError("request_conflict",409);return {id:old.id};}
 if(await tx.websiteServiceRequest.count({where:{viewerId,status:{in:["REQUESTED","CONTACTED","QUOTED"]}}})>=5)throw new ApiError("request_limit",429);
 const row=await tx.servicePageConfig.findUnique({where:{id:"default"}});const config=row?servicePageSchema.parse(row.config):defaultServicePage;const plan=config.plans[input.plan]!;
 if(!plan.enabled||input.options.some(i=>!config.ads[i]!.enabled))throw new ApiError("service_unavailable",422);
 const options=input.options.map(i=>config.ads[i]!);const hosting=input.mode==="new"?config.hosting:0;
 const quote={plan:plan.name,first:plan.first+options.reduce((n,o)=>n+o.first,0),monthly:plan.monthly+hosting+options.reduce((n,o)=>n+o.monthly,0),hosting,contractMonths:config.contractMonths,options:options.map(o=>o.name),currency:"THB",termsVersion:"website-2026-11-06",acceptedAt:new Date().toISOString(),requiresStaffConfirmation:true};
 const request=await tx.websiteServiceRequest.create({data:{requestId:input.requestId,requestHash,viewerId,details:{mode:input.mode,domain:input.domain.toLowerCase(),contact:input.contact,note:input.note},quote}});
 await tx.auditLog.create({data:{actorRole:"SYSTEM",action:"website_service_requested",resourceType:"website_service_request",resourceId:request.id,metadata:{viewerId,plan:plan.name}}});
 await customerNotice(tx,{viewerId,key:`website-request:${request.id}`,title:"รับคำขอ Website API แล้ว",message:"เจ้าหน้าที่จะตรวจโดเมน ขอบเขตงาน และยืนยันค่าบริการก่อนเปิดชำระ ยังไม่มีการจดโดเมนหรือเรียกเก็บเงิน",href:"/account/website-services"});
 return {id:request.id};
});}
export const websiteDecisionSchema=z.object({id:z.string().uuid(),revision:z.number().int().positive(),status:z.enum(["CONTACTED","QUOTED","CLOSED","CANCELLED"]),note:z.string().trim().min(5).max(2000)}).strict();
export async function updateWebsiteRequest(input:z.infer<typeof websiteDecisionSchema>,actor:Actor){return prisma.$transaction(async tx=>{
 const item=await tx.websiteServiceRequest.findUnique({where:{id:input.id}});if(!item)throw new ApiError("not_found",404);
 if(["CLOSED","CANCELLED"].includes(item.status))throw new ApiError("request_closed",409);
 const allowed:Record<string,string[]>={REQUESTED:["CONTACTED","CANCELLED"],CONTACTED:["QUOTED","CANCELLED"],QUOTED:["CONTACTED","CLOSED","CANCELLED"]};
 if(!allowed[item.status]?.includes(input.status))throw new ApiError("invalid_transition",409);
 const updated=await tx.websiteServiceRequest.updateMany({where:{id:input.id,revision:input.revision},data:{status:input.status,staffNote:input.note,revision:{increment:1}}});if(!updated.count)throw new ApiError("revision_conflict",409);
 await tx.auditLog.create({data:{actorId:actor.id,actorRole:actor.role,action:"website_service_updated",resourceType:"website_service_request",resourceId:item.id,metadata:{before:item.status,after:input.status,note:input.note}}});
 await customerNotice(tx,{viewerId:item.viewerId,key:`website-request:${item.id}:${input.revision+1}`,title:"อัปเดตคำขอ Website API",message:input.note,href:"/account/website-services"});return {ok:true};
});}
