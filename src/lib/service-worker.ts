import { purgeBankAccounts } from "./bank-transfer-server";
import { prisma } from "./prisma";
import { refreshExpiryAlerts } from "./ads-notifications";
import { orderAlert } from "./ads-notification-events";
import { deliverServiceMail } from "./service-mail";
import { reconcilePromptPay } from "./promptpay-orders";
import { promptPayReady } from "./promptpay-2c2p";
import { ApiError } from "./api-response";
import { recoverStripePayments } from "./stripe-recovery";
export async function runServiceWorker() {
  const run=await prisma.$transaction(async tx=>{
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(73421, 77)`;
    await tx.serviceWorkerRun.updateMany({where:{status:"RUNNING",startedAt:{lt:new Date(Date.now()-15*60000)}},data:{status:"INTERRUPTED",finishedAt:new Date()}});
    if(await tx.serviceWorkerRun.findFirst({where:{status:"RUNNING"}}))throw new ApiError("worker_running",409);
    return tx.serviceWorkerRun.create({data:{status:"RUNNING",details:{}}});
  });
  try {
    let checked=0, failed=0;
    const previous=await prisma.serviceWorkerRun.findFirst({where:{status:{in:["SUCCEEDED","DEGRADED"]}},orderBy:{startedAt:"desc"},select:{details:true}});
    const cursor=(previous?.details as {paymentCursor?:string}|undefined)?.paymentCursor;
    let paymentCursor:string|null=null;
    if(promptPayReady()){
      const where={status:{in:["PAYMENT","EXPIRED"]},quote:{path:["promptpay","provider"],equals:"2c2p"},createdAt:{gte:new Date(Date.now()-7*86400000)}};
      let orders=await prisma.adsOrder.findMany({where:{...where,...(cursor?{id:{gt:cursor}}:{})},select:{id:true},orderBy:{id:"asc"},take:10});
      if(!orders.length&&cursor)orders=await prisma.adsOrder.findMany({where,select:{id:true},orderBy:{id:"asc"},take:10});
      for(const order of orders){try{await reconcilePromptPay(order.id);checked++;}catch{failed++;}paymentCursor=order.id;}
    }
    const stripe = await recoverStripePayments((previous?.details as {stripe?:{cursor?:string}} | undefined)?.stripe?.cursor);
    await refreshExpiryAlerts();
    await prisma.$transaction(async tx=>{
      const late=await tx.adsOrder.findMany({where:{status:"PAID",dueAt:{lte:new Date()}},take:200});
      for(const order of late)await orderAlert(tx,{orderId:order.id,key:`sla:${order.id}:${order.dueAt!.toISOString()}`,kind:"OTHER_ISSUE",title:"งานติดตั้งเกินกำหนด",message:`ผู้รับผิดชอบ ${order.assignedName||"ยังไม่ระบุ"} กรุณาตรวจสอบและแจ้งความคืบหน้าให้ลูกค้า`});
      const tickets=await tx.adsNotification.findMany({where:{source:"CUSTOMER",status:"OPEN",createdAt:{lte:new Date(Date.now()-24*3600000)}},take:200});
      for(const ticket of tickets)await orderAlert(tx,{orderId:ticket.orderId,key:`ticket-sla:${ticket.id}`,kind:"OTHER_ISSUE",title:"คำร้องยังไม่ปิดเกิน 24 ชั่วโมง",message:"กรุณาตรวจคำร้องและตอบกลับลูกค้าในรายละเอียดคำสั่งซื้อ"});
    });
    const bankAccountsPurged=await purgeBankAccounts();
    const mail=await deliverServiceMail();
    await prisma.accountAction.deleteMany({where:{expiresAt:{lt:new Date(Date.now()-7*86400000)}}});
    const details={bankAccountsPurged,paymentChecked:checked,paymentFailures:failed,paymentCursor,stripe,mail};
    await prisma.serviceWorkerRun.update({where:{id:run.id},data:{status:failed || stripe.failed || mail.uncertain?"DEGRADED":"SUCCEEDED",details,finishedAt:new Date()}});
    return details;
  }catch(error){await prisma.serviceWorkerRun.update({where:{id:run.id},data:{status:"FAILED",finishedAt:new Date(),details:{error:"worker_failed_check_logs"}}});throw error;}
}
