import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {PrismaClient} from '@prisma/client';
import bcrypt from 'bcryptjs';
const url=new URL(process.env.DATABASE_URL||'http://invalid');
if(url.hostname!=='127.0.0.1'||url.pathname!=='/aurum_ads_test')throw Error('Local test DB required');
const db=new PrismaClient(),base='http://localhost:3007',password='Member-management-test-2026';
async function staff(role){
 const email=randomUUID()+'@example.test';await db.user.create({data:{email,role,name:'Management test '+role,passwordHash:await bcrypt.hash(password,10)}});
 const jar=new Map();const collect=r=>r.headers.getSetCookie().forEach(c=>{const [k,...v]=c.split(';')[0].split('=');jar.set(k,v.join('='));});const cookie=()=>[...jar].map(([k,v])=>k+'='+v).join('; ');
 const csrf=await fetch(base+'/api/auth/csrf');collect(csrf);const {csrfToken}=await csrf.json();const r=await fetch(base+'/api/auth/callback/credentials',{method:'POST',redirect:'manual',headers:{cookie:cookie(),'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({email,password,csrfToken,callbackUrl:base+'/admin'})});collect(r);return cookie();
}
try{
 const manager=await staff('MANAGER'),limited=await staff('STAFF');
 const email=randomUUID()+'@example.test';const signup=await fetch(base+'/api/public/auth/register',{method:'POST',headers:{origin:base,'Content-Type':'application/json'},body:JSON.stringify({email,password,displayName:'Member management test'})});assert.equal(signup.status,201,await signup.clone().text());const {viewer}=await signup.json();const cookie=signup.headers.getSetCookie().map(c=>c.split(';')[0]).join('; ');
 const get=(suffix='',session=manager)=>fetch(base+'/api/members'+suffix,{headers:{cookie:session}});
 assert.equal((await get('',limited)).status,403);assert.equal((await get('',cookie)).status,401);
 const detail=await (await get('?id='+viewer.id)).json();assert.equal(detail.member.adminRevision,1);assert.equal('passwordHash' in detail.member,false);
 const payload={id:viewer.id,revision:1,suspended:true,staffNote:'PRIVATE STAFF NOTE',reason:'Local suspension test'};
 const patch=(body,origin=base)=>fetch(base+'/api/members',{method:'PATCH',headers:{cookie:manager,origin,'Content-Type':'application/json'},body:JSON.stringify(body)});
 assert.equal((await patch(payload,'https://invalid.example')).status,403);
 assert.equal((await patch(payload)).status,200);assert.equal((await patch(payload)).status,409);
 assert.equal(await db.viewerSession.count({where:{viewerId:viewer.id}}),0);
 const login=()=>fetch(base+'/api/public/auth/login',{method:'POST',headers:{origin:base,'Content-Type':'application/json'},body:JSON.stringify({email,password})});
 assert.equal((await login()).status,403);assert.equal((await fetch(base+'/api/public/account/orders',{headers:{cookie}})).status,401);
 assert.equal((await patch({...payload,revision:2,suspended:false,reason:'Local reactivation test'})).status,200);
 const active=await login();assert.equal(active.status,200);assert.ok(!(await active.text()).includes('PRIVATE STAFF NOTE'));
 const final=await (await get('?id='+viewer.id)).json();assert.equal(final.history.length,2);assert.equal(final.member.adminRevision,3);
 const search=await (await get('?q='+encodeURIComponent(email))).json();assert.equal(search.total,1);
 console.log('MEMBER_MANAGEMENT_OK: roles, CSRF, private fields, revision conflict, session revocation, suspended login, reactivation, audit and search');
}finally{await db.$disconnect();}
