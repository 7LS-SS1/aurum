import assert from 'node:assert/strict';
import { randomUUID, randomBytes } from 'node:crypto';
import { PrismaClient } from '@prisma/client';
import { readFile } from 'node:fs/promises';
const url = new URL(process.env.DATABASE_URL || 'http://invalid');
if (url.hostname !== '127.0.0.1' || url.pathname !== '/aurum_ads_test') throw Error('Disposable DB only');
const db = new PrismaClient(), base = 'http://localhost:3007';
try {
 const saved = await db.servicePageConfig.findUnique({where:{id:'ads-banner'}});
 const config = saved?.config || JSON.parse(await readFile('src/lib/ads-page-defaults.json','utf8'));
 const sites = [{id:randomUUID(),name:'เว็บไซต์ทดสอบ A',url:'https://site-a.example.test',enabled:true},{id:randomUUID(),name:'เว็บไซต์ทดสอบ B',url:'https://site-b.example.test',enabled:true},{id:randomUUID(),name:'ปิดรับจอง',url:'https://disabled.example.test',enabled:false}];
 await db.servicePageConfig.upsert({where:{id:'ads-banner'},create:{id:'ads-banner',config:{...config,websites:sites},revision:1},update:{config:{...config,websites:sites},revision:{increment:1}}});
 const email=randomUUID()+'@example.test';
 const signup=await fetch(base+'/api/public/auth/register',{method:'POST',headers:{origin:base,'Content-Type':'application/json'},body:JSON.stringify({email,password:'Website-test-only-2026',displayName:'Website test'})});
 assert.equal(signup.status,201); const cookie=signup.headers.getSetCookie().map(v=>v.split(';')[0]).join('; ');
 const submit=websiteId=>fetch(base+'/api/public/ads-orders',{method:'POST',headers:{cookie,origin:base,'Content-Type':'application/json',Authorization:'Bearer '+randomBytes(32).toString('hex')},body:JSON.stringify({websiteId,requestId:randomUUID(),kind:'slots',slots:['home_top:L1'],days:30,expectedAmount:1500,name:'Buyer',email,contact:'@test',artworkUrl:'https://example.test/a.png',targetUrl:'https://example.test',note:'',acceptedTerms:true})});
 assert.equal((await submit(sites[2].id)).status,422);
 assert.equal((await submit(undefined)).status,422);
 const response=await submit(sites[0].id); assert.equal(response.status,201,await response.clone().text());
 const {order}=await response.json(); assert.equal(order.quote.website.id,sites[0].id);assert.equal(order.quote.website.name,sites[0].name);
 await db.adsOrder.update({where:{id:order.id},data:{status:'ACTIVE',startsAt:new Date(),endsAt:new Date(Date.now()+86400000)}});
 const available=async site=>(await (await fetch(base+'/api/public/ads-orders?websiteId='+site)).json()).occupied;
 assert.ok((await available(sites[0].id)).includes('home_top:L1'));
 assert.ok(!(await available(sites[1].id)).includes('home_top:L1'));
 await db.adsOrder.update({where:{id:order.id},data:{status:'COMPLETED'}});
 console.log('ADS_WEBSITES_OK: required site, disabled site, trusted snapshot, per-site availability');
} finally {await db.$disconnect();}
