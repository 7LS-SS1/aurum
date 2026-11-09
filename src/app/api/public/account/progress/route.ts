import {NextRequest} from "next/server";
import {z} from "zod";
import {prisma} from "@/lib/prisma";
import {requireViewerFromRequest} from "@/lib/viewer-auth";
import {apiError,ApiError,jsonOk} from "@/lib/api-response";
export async function GET(req:NextRequest){try{const viewer=await requireViewerFromRequest(req);const id=z.string().uuid().parse(req.nextUrl.searchParams.get("id"));const order=await prisma.adsOrder.findFirst({where:{id,viewerId:viewer.id},select:{status:true,fulfillmentStage:true,assignedName:true,dueAt:true,installationProof:true,startsAt:true,endsAt:true,staffNote:true}});if(!order)throw new ApiError("not_found",404);return jsonOk(order,{headers:{"Cache-Control":"private, no-store"}});}catch(e){return apiError(e);}}
