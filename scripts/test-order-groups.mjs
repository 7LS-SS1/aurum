import assert from 'node:assert/strict';
import {PrismaClient} from '@prisma/client';
import {randomUUID} from 'node:crypto';
const url=new URL(process.env.DATABASE_URL||'http://invalid');
if(url.hostname!=='127.0.0.1'||url.pathname!=='/aurum_ads_test')throw Error('Local test DB only');
const db=new PrismaClient(),base='http://localhost:3007',ids=[];
try{
 const jar=new Map();const collect=r=>r.headers.getSetCookie().forEach(c=>{const [k,...v]=c.split(';')[0].split('=');jar.set(k,v.join('='));});const cookie=()=>[...jar].map(([k,v])=>k+'='+v).join('; ');
 const csrf=await fetch(base+'/api/auth/csrf');collect(csrf);const {csrfToken}=await csrf.json();
 const login=await fetch(base+'/api/auth/callback/credentials',{method:'POST',redirect:'manual',headers:{cookie:cookie(),'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({email:'ads-manager@example.test',password:'Local-services-test-only-2026',csrfToken,callbackUrl:base+'/admin'})});collect(login);
 const fixtures=Array.from({length:102},(_,i)=>{const id=randomUUID();ids.push(id);return {id,tokenHash:randomUUID(),requestId:randomUUID(),requestHash:randomUUID(),status:i===101?'ACTIVE':'REVIEW',customer:{name:'Order group fixture',email:'fixture@example.test',contact:'test'},quote:{items:[],website:{name:'Test site',url:'https://example.test'}},slots:[],days:30,amount:1500,artworkUrl:'',targetUrl:'',createdAt:new Date(i===101?'2000-01-01':'2030-01-01'),startsAt:i===101?new Date('2000-01-01'):null,endsAt:i===101?new Date('2099-01-01'):null};});
 await db.adsOrder.createMany({data:fixtures});
 const get=async q=>{const r=await fetch(base+'/api/ads-orders?'+q,{headers:{cookie:cookie()}});assert.equal(r.status,200,await r.clone().text());return r.json();};
 const approved=await get('group=approved');assert.ok(approved.orders.some(o=>o.id===ids[101]));assert.ok(approved.orders.every(o=>['ACTIVE','COMPLETED','REMOVAL_REQUIRED'].includes(o.status)));
 const exact=await get('group=all&q='+ids[101]);assert.equal(exact.orders.length,1);assert.equal(exact.orders[0].id,ids[101]);assert.equal(exact.counts.all,1);
 const partial=await get('group=approved&q='+ids[101].slice(0,16).toUpperCase());assert.equal(partial.orders[0].id,ids[101]);
 const wrongGroup=await get('group=pending&q='+ids[101]);assert.equal(wrongGroup.orders.length,0);assert.equal(wrongGroup.counts.approved,1);
 const missing=await get('group=all&q=not-an-existing-order');assert.equal(missing.orders.length,0);assert.equal(missing.counts.all,0);
 const pending=await get('group=pending');assert.equal(pending.orders.length,100);assert.ok(pending.nextCursor);assert.ok(pending.counts.pending>=101);
 const next=await get('group=pending&cursor='+pending.nextCursor);assert.ok(next.orders.some(o=>ids.includes(o.id)));assert.ok(next.orders.every(o=>!pending.orders.some(p=>p.id===o.id)));
 assert.equal((await fetch(base+'/api/ads-orders?group=invalid',{headers:{cookie:cookie()}})).status,422);
 assert.equal((await fetch(base+'/api/ads-orders?q='+('x'.repeat(101)),{headers:{cookie:cookie()}})).status,422);
 console.log('ORDER_GROUPS_OK: filtering beyond 100 rows, full/partial case-insensitive order search, category counts, no results, pagination and validation');
}finally{await db.adsOrder.deleteMany({where:{id:{in:ids}}});await db.$disconnect();}
