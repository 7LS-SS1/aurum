import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireMinRole } from "@/lib/authz";
import { apiError,jsonOk } from "@/lib/api-response";
import { mailReady } from "@/lib/service-mail";
import { promptPayReady } from "@/lib/promptpay-2c2p";
export async function GET(req:NextRequest){try{
 await requireMinRole("MANAGER");
 const [statuses,late,unassigned,tickets,mail,runs,staff]=await Promise.all([
 prisma.adsOrder.groupBy({by:["status"],_count:true,_sum:{amount:true}}),
 prisma.adsOrder.findMany({where:{status:"PAID",dueAt:{lte:new Date()}},select:{id:true,assignedName:true,dueAt:true},take:50,orderBy:{dueAt:"asc"}}),
 prisma.adsOrder.count({where:{status:"PAID",assignedTo:null}}),
 prisma.adsNotification.count({where:{source:"CUSTOMER",status:"OPEN"}}),
 prisma.serviceMail.groupBy({by:["status"],_count:true}),
 prisma.serviceWorkerRun.findMany({take:10,orderBy:{startedAt:"desc"}}),
 prisma.user.findMany({where:{role:{in:["MANAGER","HEAD"]}},select:{id:true,name:true},orderBy:{name:"asc"}})]);
 if(req.nextUrl.searchParams.get("format")==="csv"){
 const csv="\uFEFFstatus,orders,order_value_thb\r\n"+statuses.map(s=>`${s.status},${s._count},${s._sum.amount||0}`).join("\r\n");
 return new Response(csv,{headers:{"Content-Type":"text/csv; charset=utf-8","Content-Disposition":"attachment; filename=service-status-report.csv","Cache-Control":"private, no-store"}});
 }
 return jsonOk({statuses,late,unassigned,tickets,mail,runs,staff,emailReady:mailReady(),promptPayReady:promptPayReady(),workerStale:!runs[0]||runs[0].startedAt.getTime()<Date.now()-15*60000},{headers:{"Cache-Control":"private, no-store"}});
}catch(e){return apiError(e);}}
