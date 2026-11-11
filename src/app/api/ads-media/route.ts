import { createHash } from "node:crypto";
import { NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireMinRole } from "@/lib/authz";
import { ApiError, apiError, jsonOk } from "@/lib/api-response";
import { getR2ObjectKeyFromPublicUrl } from "@/lib/storage/r2";
import { manualAdsSchema } from "@/lib/ads-manual";

const mediaSchema = z.object({
  url: z.string().url().max(2000).refine(v => { const u = new URL(v); return u.protocol === "https:" && !u.username && !u.password; }),
  name: z.string().trim().min(1).max(255),
  type: z.enum(["image/png", "image/jpeg", "image/webp", "image/gif", "video/mp4"]),
  size: z.number().int().positive(),
}).strict();
export async function GET() {
  try {
    await requireMinRole("MANAGER");
    const rows = await prisma.servicePageConfig.findMany({where:{OR:[{id:{startsWith:"ads-media:"}},{id:{startsWith:"manual-ads:"}}]},orderBy:{updatedAt:"desc"}});
    const items = new Map<string, {url:string;name:string;type:string;size?:number}>();
    for (const row of rows) {
      if (row.id.startsWith("ads-media:")) {
        const parsed = mediaSchema.safeParse(row.config);
        if (parsed.success) items.set(parsed.data.url, parsed.data);
      }
    }
    for (const row of rows.filter(r=>r.id.startsWith("manual-ads:"))) {
      const parsed = manualAdsSchema.safeParse(row.config);
      if (parsed.success) for (const ad of parsed.data) if (!items.has(ad.url)) items.set(ad.url,{url:ad.url,name:ad.title,type:ad.slot.startsWith("video_ad:")?"video/mp4":"image/legacy"});
    }
    return jsonOk({items:[...items.values()]},{headers:{"Cache-Control":"no-store"}});
  } catch(e) { return apiError(e); }
}
export async function POST(req:NextRequest) {
  try {
    await requireMinRole("MANAGER");
    const input=mediaSchema.parse(await req.json());
    const max=input.type==="video/mp4"?20*1024*1024*1024:15*1024*1024;
    if(input.size>max) throw new ApiError("file_too_large",422);
    const key=getR2ObjectKeyFromPublicUrl(input.url);
    if(!key || !key.startsWith(input.type==="video/mp4"?"videos/":"images/")) throw new ApiError("invalid_media_url",422);
    const id=`ads-media:${createHash("sha256").update(input.url).digest("hex")}`;
    await prisma.servicePageConfig.upsert({where:{id},create:{id,config:input},update:{config:input,revision:{increment:1}}});
    return jsonOk(input);
  } catch(e) { return apiError(e); }
}
