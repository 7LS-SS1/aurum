import {NextRequest} from "next/server";
import {prisma} from "@/lib/prisma";
import {requireViewerFromRequest} from "@/lib/viewer-auth";
import {requireMinRole} from "@/lib/authz";
import {ApiError,apiError,jsonOk} from "@/lib/api-response";
import {createWebsiteRequest,websiteRequestSchema,websiteDecisionSchema,updateWebsiteRequest} from "@/lib/website-service-requests";
import {readServicePageBody,servicePageOriginAllowed} from "@/lib/service-page-request";
import {rateLimit} from "@/lib/rate-limit";
import {z} from "zod";
export async function GET(req:NextRequest){try{const admin=req.nextUrl.searchParams.get("admin")==="1";const viewer=admin?(await requireMinRole("MANAGER"),null):await requireViewerFromRequest(req);const cursor=z.string().uuid().optional().parse(req.nextUrl.searchParams.get("cursor")||undefined);const rows=await prisma.websiteServiceRequest.findMany({where:viewer?{viewerId:viewer.id}:{},select:{id:true,status:true,quote:true,details:true,staffNote:true,revision:true,createdAt:true,viewer:{select:{displayName:true}}},orderBy:[{createdAt:"desc"},{id:"desc"}],take:31,...(cursor?{cursor:{id:cursor},skip:1}:{})});return jsonOk({items:rows.slice(0,30),nextCursor:rows.length>30?rows[29]!.id:null},{headers:{"Cache-Control":"private, no-store"}});}catch(e){return apiError(e);}}
export async function POST(req:NextRequest){try{if(!servicePageOriginAllowed(req.headers.get("origin"),req.url))throw new ApiError("invalid_origin",403);const viewer=await requireViewerFromRequest(req);if(!(await rateLimit(`website-request:${viewer.id}`,{limit:10,windowMs:3600000})).success)throw new ApiError("rate_limited",429);return jsonOk(await createWebsiteRequest(websiteRequestSchema.parse(await readServicePageBody(req)),viewer.id));}catch(e){return apiError(e);}}
export async function PATCH(req:NextRequest){try{if(!servicePageOriginAllowed(req.headers.get("origin"),req.url))throw new ApiError("invalid_origin",403);const actor=await requireMinRole("MANAGER");return jsonOk(await updateWebsiteRequest(websiteDecisionSchema.parse(await readServicePageBody(req)),actor));}catch(e){return apiError(e);}}
