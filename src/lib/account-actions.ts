import { randomBytes } from "node:crypto";
import { z } from "zod";
import { prisma } from "./prisma";
import { ApiError } from "./api-response";
import { hashToken, hashPassword } from "./viewer-auth";
import { mailReady, queueMail } from "./service-mail";
export const actionRequestSchema = z.object({ purpose: z.enum(["verify", "reset"]), email: z.string().trim().email().max(200) }).strict();
export async function requestAccountAction(input: z.infer<typeof actionRequestSchema>, viewerId?: string) {
  if (!mailReady()) throw new ApiError("email_not_configured",503);
  const origin = new URL(process.env.SERVICE_PUBLIC_ORIGIN || "");
  if (origin.protocol!=="https:" || origin.username || origin.password || origin.pathname!=="/") throw new ApiError("email_not_configured",503);
  const email=input.email.toLowerCase();
  return prisma.$transaction(async tx=>{
    const viewer=await tx.viewer.findUnique({where:{email}});
    if(!viewer || viewer.suspended || (input.purpose==="verify" && (viewer.id!==viewerId || viewer.emailVerifiedAt))) return;
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${viewer.id}), 31)`;
    if(await tx.accountAction.count({where:{viewerId:viewer.id,createdAt:{gte:new Date(Date.now()-3600000)}}})>=3)return;
    const token=randomBytes(32).toString("base64url");
    await tx.accountAction.updateMany({where:{viewerId:viewer.id,purpose:input.purpose,consumedAt:null},data:{consumedAt:new Date()}});
    const row=await tx.accountAction.create({data:{viewerId:viewer.id,email,purpose:input.purpose,tokenHash:hashToken(token),expiresAt:new Date(Date.now()+30*60000)}});
    await queueMail(tx,`account:${row.id}`,{to:email,subject:input.purpose==="reset"?"ตั้งรหัสผ่าน AURUM ใหม่":"ยืนยันอีเมล AURUM",text:`เปิดลิงก์นี้ภายใน 30 นาที เพื่อ${input.purpose==="reset"?"ตั้งรหัสผ่านใหม่":"ยืนยันอีเมล"}\n${origin.origin}/account/recovery#token=${token}&purpose=${input.purpose}\nหากคุณไม่ได้ขอทำรายการ ไม่ต้องดำเนินการใด ๆ`});
  });
}
export const consumeActionSchema=z.object({token:z.string().regex(/^[A-Za-z0-9_-]{43}$/),purpose:z.enum(["verify","reset"]),password:z.string().min(12).max(72).optional()}).strict();
export async function consumeAccountAction(input:z.infer<typeof consumeActionSchema>){
  if(input.purpose==="reset"&&!input.password)throw new ApiError("password_required",422);
  if(input.password&&Buffer.byteLength(input.password,"utf8")>72)throw new ApiError("password_too_long",422);
  const passwordHash=input.password?await hashPassword(input.password):undefined;
  return prisma.$transaction(async tx=>{
    const action=await tx.accountAction.findUnique({where:{tokenHash:hashToken(input.token)},include:{viewer:true}});
    if(!action||action.purpose!==input.purpose||action.consumedAt||action.expiresAt<=new Date()||action.viewer.suspended||action.email!==action.viewer.email)throw new ApiError("invalid_or_expired_link",422);
    const updated=await tx.accountAction.updateMany({where:{id:action.id,consumedAt:null,expiresAt:{gt:new Date()}},data:{consumedAt:new Date()}});
    if(!updated.count)throw new ApiError("invalid_or_expired_link",422);
    await tx.viewer.update({where:{id:action.viewerId},data:input.purpose==="verify"?{emailVerifiedAt:new Date()}:{passwordHash}});
    if(input.purpose==="reset"){
      await tx.viewerSession.deleteMany({where:{viewerId:action.viewerId}});
      await tx.accountAction.updateMany({where:{viewerId:action.viewerId,consumedAt:null},data:{consumedAt:new Date()}});
    }
    await tx.auditLog.create({data:{actorRole:"SYSTEM",action:`member_${input.purpose}`,resourceType:"viewer",resourceId:action.viewerId,metadata:{source:"verified_email_link"}}});
  });
}
