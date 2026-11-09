import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {PrismaClient} from '@prisma/client';
const url=new URL(process.env.DATABASE_URL||'http://invalid');if(url.hostname!=='127.0.0.1'||url.pathname!=='/aurum_ads_test')throw Error('Disposable DB only');
const db=new PrismaClient(),base='http://localhost:3007';
try{
 const res=await fetch(base+'/api/public/auth/register',{method:'POST',headers:{origin:base,'Content-Type':'application/json'},body:JSON.stringify({email:randomUUID()+'@example.test',password:'History-test-only-2026',displayName:'History test'})});assert.equal(res.status,201);const {viewer}=await res.json();const cookie=res.headers.getSetCookie().map(v=>v.split(';')[0]).join('; ');
 const previous=await db.adsOrder.findFirstOrThrow();const id=randomUUID();await db.adsOrder.create({data:{...previous,id,requestId:randomUUID(),tokenHash:randomUUID(),viewerId:viewer.id,paymentReference:null,status:'PAYMENT',holdUntil:new Date(Date.now()-1000),createdAt:new Date(),updatedAt:new Date()}});
 await db.auditLog.create({data:{actorRole:'MANAGER',action:'ads_order_approve',resourceType:'ads_order',resourceId:id,metadata:{before:'REVIEW',after:'PAYMENT',note:'เปิดชำระเงิน',reference:'PRIVATE-REFERENCE'}}});
 const endpoint=base+'/api/public/account/order-history?id='+id;
 assert.equal((await fetch(endpoint)).status,401);
 const history=await fetch(endpoint,{headers:{cookie}});assert.equal(history.status,200);assert.ok(!(await history.text()).includes('PRIVATE-REFERENCE'));
 assert.equal((await fetch(endpoint+'&admin=1',{headers:{cookie}})).status,401);
 assert.equal((await fetch(base+'/api/public/account/order-history?id='+previous.id,{headers:{cookie}})).status,404);
 await fetch(base+'/api/public/account/orders',{headers:{cookie}});
 const after=await (await fetch(endpoint,{headers:{cookie}})).json();assert.ok(after.events.some(e=>e.after==='EXPIRED'));
 console.log('ORDER_HISTORY_OK: owner access, anonymous/cross-owner/admin denial, private-reference filtering, automatic expiration event');
}finally{await db.$disconnect();}
