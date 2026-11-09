import { NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireViewerFromRequest,hashToken,VIEWER_COOKIE_NAME } from "@/lib/viewer-auth";
import { apiError,ApiError,jsonOk } from "@/lib/api-response";
import { servicePageOriginAllowed,readServicePageBody } from "@/lib/service-page-request";
export async function GET(req:NextRequest){try{const viewer=await requireViewerFromRequest(req);const current=hashToken(req.cookies.get(VIEWER_COOKIE_NAME)!.value);const rows=await prisma.viewerSession.findMany({where:{viewerId:viewer.id,expiresAt:{gt:new Date()}},select:{id:true,userAgent:true,createdAt:true,expiresAt:true,tokenHash:true},orderBy:{createdAt:"desc"},take:100});return jsonOk({items:rows.map(({tokenHash,...s})=>({...s,current:tokenHash===current}))},{headers:{"Cache-Control":"private, no-store"}});}catch(e){return apiError(e);}}
export async function DELETE(req:NextRequest){try{if(!servicePageOriginAllowed(req.headers.get("origin"),req.url))throw new ApiError("invalid_origin",403);const viewer=await requireViewerFromRequest(req);const body=z.object({id:z.string().optional()}).strict().parse(await readServicePageBody(req));const current=hashToken(req.cookies.get(VIEWER_COOKIE_NAME)!.value);await prisma.viewerSession.deleteMany({where:{viewerId:viewer.id,tokenHash:{not:current},...(body.id?{id:body.id}:{})}});return jsonOk({ok:true});}catch(e){return apiError(e);}}
