import { NextRequest } from "next/server";
import { apiError, jsonOk } from "@/lib/api-response";
import { getViewerFromRequest } from "@/lib/viewer-auth";
import { prisma } from "@/lib/prisma";

export async function GET(req: NextRequest) {
  try {
    const viewer = await getViewerFromRequest(req);
    const contact = viewer ? await prisma.viewer.findUnique({where:{id:viewer.id},select:{phone:true}}) : null;
    const last = viewer ? await prisma.adsOrder.findFirst({where:{viewerId:viewer.id},orderBy:{createdAt:"desc"},select:{customer:true}}) : null;
    const previous=last?.customer as {contact?:string}|undefined;
    return jsonOk({ viewer, bookingContact: previous?.contact || contact?.phone || "" }, {headers:{"Cache-Control":"private, no-store"}});
  } catch (err) {
    return apiError(err);
  }
}
