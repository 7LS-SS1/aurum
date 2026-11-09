import assert from "node:assert/strict";
import {randomUUID} from "node:crypto";
import {unlink} from "node:fs/promises";
import path from "node:path";
async function main(){
 const url=new URL(process.env.DATABASE_URL||"http://invalid");if(url.hostname!=="127.0.0.1"||url.port!=="55439"||url.pathname!=="/aurum_ads_test")throw Error("Isolated local database only");
 process.env.SERVICE_EMAIL_ENABLED="false";
 const {prisma}=await import("../src/lib/prisma");
 const {actOnOrder}=await import("../src/lib/ads-orders");
 const {submitCustomerRequest,replyToTicket,updateNotification}=await import("../src/lib/ads-notifications");
 const {requestArtwork,decideArtwork}=await import("../src/lib/ads-artwork");
 const {saveAttachment}=await import("../src/lib/ads-attachments");
 const {consumeAccountAction}=await import("../src/lib/account-actions");
 const {hashToken,verifyPassword}=await import("../src/lib/viewer-auth");
 const viewerId=randomUUID(),staffId=randomUUID(),id=randomUUID(),fileIds:string[]=[];
 const actor={id:staffId,role:"MANAGER" as const};
 try{
 await prisma.viewer.create({data:{id:viewerId,email:`ops-${viewerId}@example.test`,displayName:"Local operations test"}});
 await prisma.user.create({data:{id:staffId,email:`staff-${staffId}@example.test`,name:"Local operator",role:"MANAGER",passwordHash:"unused-test-only"}});
 const png=Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAIAAAD91JpzAAAACXBIWXMAAAPoAAAD6AG1e1JrAAAAEklEQVQImWMInXk3dOZdBggFADAiBy1VU9MRAAAAAElFTkSuQmCC","base64");
 const upload=()=>saveAttachment(new Request("http://localhost",{method:"POST",headers:{"content-type":"image/png","x-file-name":"test.png"},body:png}),viewerId);
 await assert.rejects(saveAttachment(new Request("http://localhost",{method:"POST",headers:{"content-type":"image/png"},body:png.subarray(0,9)}),viewerId),/invalid_media/);
 const file=await upload();fileIds.push(file.id);
 await prisma.adsOrder.create({data:{id,viewerId,requestId:randomUUID(),requestHash:randomUUID(),tokenHash:randomUUID(),customer:{name:"Local test"},quote:{items:["Test slot"],attachments:[{slot:"home_top:L1",fileId:file.id,name:file.name,targetUrl:"https://example.test/old"}]},slots:["home_top:L1"],amount:1500,days:30,status:"PAID",artworkUrl:"",targetUrl:""}});
 let revision=1;
 await assert.rejects(actOnOrder(id,{revision,action:"activate",note:"Should not bypass review"},actor),/installation_review_required/);
 await actOnOrder(id,{revision:revision++,action:"assign",dueAt:new Date(Date.now()+3600000).toISOString(),note:"Assign local test"},actor);
 await actOnOrder(id,{revision:revision++,action:"install",note:"Start installation test"},actor);
 await assert.rejects(actOnOrder(id,{revision,action:"review_installation",note:"Missing proof",proof:[]},actor),/installation_proof_required/);
 await actOnOrder(id,{revision:revision++,action:"review_installation",note:"Installed all slots",proof:[{slot:"home_top:L1",url:"https://example.test/proof"}]},actor);
 await actOnOrder(id,{revision:revision++,action:"activate",note:"Approve installed service"},actor);
 const active=await prisma.adsOrder.findUniqueOrThrow({where:{id}});assert.equal(active.endsAt!.getTime()-active.startsAt!.getTime(),30*86400000);assert.equal(active.fulfillmentStage,"approved");
 const ticket=await submitCustomerRequest({orderId:id,requestId:randomUUID(),kind:"OTHER_ISSUE",reason:"other",message:"Please check this test placement"},viewerId);
 await assert.rejects(replyToTicket({id:ticket.id,requestId:randomUUID(),message:"Wrong owner",files:[],reopen:false},{viewerId:randomUUID()}),/not_found/);
 const reply={id:ticket.id,requestId:randomUUID(),message:"Staff reply for test",files:[],reopen:false};await replyToTicket(reply,{actor});await replyToTicket(reply,{actor});assert.equal(await prisma.adsTicketMessage.count({where:{ticketId:ticket.id}}),1);
 await updateNotification(ticket.id,"resolve","Resolved for testing",actor);
 await replyToTicket({id:ticket.id,requestId:randomUUID(),message:"Reopen with proof",files:[file.id],reopen:true},{viewerId});assert.equal((await prisma.adsNotification.findUniqueOrThrow({where:{id:ticket.id}})).status,"OPEN");
 const request=await requestArtwork({orderId:id,requestId:randomUUID(),slot:"home_top:L1",fileId:file.id,targetUrl:"https://example.test/new",note:"Change target for test"},viewerId);
 await assert.rejects(decideArtwork({id:request.id,revision:1,action:"install",response:"Too early",proofUrl:"https://example.test/proof"},actor),/invalid_transition/);
 await decideArtwork({id:request.id,revision:1,action:"approve",response:"Artwork approved"},actor);
 await decideArtwork({id:request.id,revision:2,action:"install",response:"Artwork installed",proofUrl:"https://example.test/proof2"},actor);
 const changed=await prisma.adsOrder.findUniqueOrThrow({where:{id}});assert.equal(JSON.stringify(changed.quote),JSON.stringify(active.quote));assert.match(JSON.stringify(changed.currentArtwork),/example.test\/new/);
 const token=Buffer.from(randomUUID()+randomUUID()).toString("base64url").slice(0,43);
 await prisma.accountAction.create({data:{viewerId,tokenHash:hashToken(token),purpose:"reset",email:`ops-${viewerId}@example.test`,expiresAt:new Date(Date.now()+60000)}});
 await prisma.viewerSession.create({data:{viewerId,tokenHash:randomUUID(),expiresAt:new Date(Date.now()+60000)}});
 await consumeAccountAction({token,purpose:"reset",password:"Local-test-password-2026"});assert.equal(await prisma.viewerSession.count({where:{viewerId}}),0);
 assert.ok(await verifyPassword("Local-test-password-2026",(await prisma.viewer.findUniqueOrThrow({where:{id:viewerId}})).passwordHash!));
 await assert.rejects(consumeAccountAction({token,purpose:"reset",password:"Local-test-password-2026"}),/invalid_or_expired_link/);
 assert.ok(await prisma.customerNotice.count({where:{viewerId}})>=5);assert.equal(await prisma.serviceMail.count({where:{dedupeKey:{contains:id}}}),0);
 console.log("SERVICE_OPERATIONS_LOCAL_OK: media validation, assignment, proof gate, activation, ticket ownership/idempotency/reopen, artwork immutable quote, notices, one-use reset and session revocation; no external delivery");
 }finally{
 await prisma.adsArtworkRequest.deleteMany({where:{orderId:id}});await prisma.adsOrder.deleteMany({where:{id}});await prisma.viewer.deleteMany({where:{id:viewerId}});await prisma.user.deleteMany({where:{id:staffId}});await prisma.auditLog.deleteMany({where:{resourceId:{in:[id,viewerId]}}});await prisma.$disconnect();
 for(const f of fileIds)for(const ext of ["json","bin"])await unlink(path.join(process.env.ADS_UPLOAD_DIR||path.join(process.cwd(),".local-ads-uploads"),`${f}.${ext}`)).catch(()=>{});
 }
}
main().catch(e=>{console.error(e);process.exitCode=1;});
