import assert from 'node:assert/strict';
import { randomBytes, randomUUID, createHash } from 'node:crypto';
import { PrismaClient } from '@prisma/client';
const url=new URL(process.env.DATABASE_URL || 'http://invalid');
if(url.hostname!=='127.0.0.1' || url.pathname!=='/aurum_ads_test')throw Error('Disposable test DB required');
const db=new PrismaClient();const base='http://localhost:3007';
async function register(){const email=randomUUID()+'@example.test';const r=await fetch(base+'/api/public/auth/register',{method:'POST',headers:{origin:base,'Content-Type':'application/json'},body:JSON.stringify({email,password:'Member-test-only-2026',displayName:'Account test'})});assert.equal(r.status,201,await r.clone().text());return {cookie:r.headers.getSetCookie().map(v=>v.split(';')[0]).join('; '),viewer:(await r.json()).viewer,email};}
const get=(path,cookie)=>fetch(base+path,{headers:{cookie}});
try {
 const a=await register(),b=await register();
 assert.equal((await get('/api/ads-orders',a.cookie)).status,401);
 assert.equal((await fetch(base+'/api/public/account/orders')).status,401);
 const websiteId=(await db.servicePageConfig.findUniqueOrThrow({where:{id:'ads-banner'}})).config.websites.find(s=>s.enabled).id;
 const data={websiteId,requestId:randomUUID(),kind:'slots',slots:['home_top:L3'],days:30,expectedAmount:1500,name:'Buyer',email:a.email,contact:'@test',artworkUrl:'https://example.test/art.png',targetUrl:'https://example.test',note:'',acceptedTerms:true};
 const token=randomBytes(32).toString('hex');
 const submit=cookie=>fetch(base+'/api/public/ads-orders',{method:'POST',headers:{cookie,origin:base,Authorization:'Bearer '+token,'Content-Type':'application/json'},body:JSON.stringify(data)});
 assert.equal((await submit('')).status,401);
 const created=await submit(a.cookie);assert.equal(created.status,201,await created.clone().text());const order=(await created.json()).order;
 const stored=await db.adsOrder.findUniqueOrThrow({where:{id:order.id}});assert.equal(stored.viewerId,a.viewer.id);
 assert.equal((await (await get('/api/public/account/orders',a.cookie)).json()).orders[0].id,order.id);
 assert.equal((await (await get('/api/public/account/orders',b.cookie)).json()).orders.length,0);
 const secretRead=cookie=>fetch(base+'/api/public/ads-orders',{headers:{cookie,Authorization:'Bearer '+token}});
 assert.equal((await secretRead(a.cookie)).status,200);assert.equal((await secretRead(b.cookie)).status,404);assert.equal((await secretRead('')).status,404);
 const claim=(secret,cookie)=>fetch(base+'/api/public/account/orders',{method:'POST',headers:{cookie,origin:base,'Content-Type':'application/json'},body:JSON.stringify({token:secret})});
 assert.equal((await claim(token,b.cookie)).status,404);
 const legacy=randomBytes(32).toString('hex');await db.adsOrder.create({data:{...stored,id:randomUUID(),viewerId:null,requestId:randomUUID(),tokenHash:createHash('sha256').update(legacy).digest('hex')}});
 assert.equal((await claim(legacy,b.cookie)).status,200);assert.equal((await claim(legacy,a.cookie)).status,404);
 const before=await db.viewer.count();
 const phone=await fetch(base+'/api/public/auth/phone',{method:'POST',headers:{origin:base,'Content-Type':'application/json'},body:JSON.stringify({phone:'0812345678',action:'verify',code:'123456'})});assert.equal(phone.status,503);assert.equal(await db.viewer.count(),before);
 for(const path of ['/','/videos','/services','/services/ads-banner','/services/ads-banner/book','/account','/library','/liked','/register','/login']) {const r=await get(path,a.cookie);assert.equal(r.status,200,path);}
 const account=await (await get('/account',a.cookie)).text();assert.ok(account.includes('Dashboard'));assert.ok(account.includes('ตั้งค่าโปรไฟล์'));
 const profile=(cookie,origin,body)=>fetch(base+'/api/public/account/profile',{method:'PATCH',headers:{cookie,origin,'Content-Type':'application/json'},body:JSON.stringify(body)});
 assert.equal((await profile('',base,{displayName:'Updated name'})).status,401);
 assert.equal((await profile(a.cookie,'https://invalid.example',{displayName:'Updated name'})).status,403);
 assert.equal((await profile(a.cookie,base,{displayName:'Updated name',id:b.viewer.id})).status,422);
 assert.equal((await profile(a.cookie,base,{displayName:'Updated name'})).status,200);
 assert.equal((await db.viewer.findUniqueOrThrow({where:{id:a.viewer.id}})).displayName,'Updated name');
 assert.equal((await db.viewer.findUniqueOrThrow({where:{id:b.viewer.id}})).displayName,'Account test');
 const out=await fetch(base+'/api/public/auth/logout',{method:'POST',headers:{cookie:a.cookie,origin:base}});assert.equal(out.status,200);assert.equal((await get('/api/public/account/orders',a.cookie)).status,401);
 console.log('MEMBER_HTTP_OK: email signup, member isolation, staff separation, legacy claim, SMS fail-closed, logout and 10 public routes');
} finally {await db.$disconnect();}
