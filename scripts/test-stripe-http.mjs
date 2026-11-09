import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';
import Stripe from 'stripe';
const url = new URL(process.env.DATABASE_URL || 'http://invalid');
assert.equal(url.hostname,'127.0.0.1'); assert.equal(url.port,'55441'); assert.equal(url.pathname,'/aurum_stripe_test');
const db = new PrismaClient(), base = 'http://localhost:3317';
async function login(role) {
  const email = `stripe-${role.toLowerCase()}@example.test`, password = 'Local-stripe-test-only-2026';
  await db.user.upsert({ where: { email }, create: { email, role, name: `Stripe ${role}`, passwordHash: await bcrypt.hash(password,10) }, update: { role } });
  const jar = new Map();
  const collect = response => response.headers.getSetCookie().forEach(raw => { const pair=raw.split(';')[0], at=pair.indexOf('='); jar.set(pair.slice(0,at),pair.slice(at+1)); });
  const cookie = () => [...jar].map(([key,value])=>`${key}=${value}`).join('; ');
  const csrf = await fetch(base+'/api/auth/csrf'); collect(csrf);
  const { csrfToken } = await csrf.json();
  collect(await fetch(base+'/api/auth/callback/credentials',{method:'POST',redirect:'manual',headers:{'Content-Type':'application/x-www-form-urlencoded',cookie:cookie()},body:new URLSearchParams({email,password,csrfToken,callbackUrl:base+'/admin/payments'})}));
  return cookie();
}
async function register() {
  const res = await fetch(base+'/api/public/auth/register',{method:'POST',headers:{origin:base,'Content-Type':'application/json'},body:JSON.stringify({email:randomUUID()+'@example.test',password:'Local-stripe-member-2026',displayName:'Stripe Member Test'})});
  assert.equal(res.status,201);
  return {cookie:res.headers.getSetCookie().map(x=>x.split(';')[0]).join('; '),viewer:(await res.json()).viewer};
}
const call = (path, cookie='', method='GET', body, origin=base) => fetch(base+path,{method,redirect:'manual',headers:{cookie,origin,'Content-Type':'application/json'},...(body?{body:JSON.stringify(body)}:{})});
try {
  const manager=await login('MANAGER'), staff=await login('STAFF'), a=await register(), b=await register();
  assert.equal((await call('/api/stripe-orders')).status,401);
  assert.equal((await call('/api/stripe-orders',staff)).status,403);
  assert.equal((await call('/api/stripe-orders',a.cookie)).status,401);
  const draft={kind:'VIDEO',requestId:randomUUID(),viewerId:a.viewer.id,title:'HTTP sandbox service draft',amountSatang:10000,mode:'CHECKOUT'};
  assert.equal((await call('/api/stripe-orders',manager,'POST',draft,'https://evil.test')).status,403);
  const created=await call('/api/stripe-orders',manager,'POST',draft); assert.equal(created.status,200,await created.clone().text());
  const {order}=await created.json();
  assert.equal((await call('/api/stripe-orders',manager,'POST',{...draft,amountSatang:1})).status,422);
  const own=await (await call('/api/public/payments/stripe',a.cookie)).json(); assert.ok(own.orders.some(o=>o.id===order.id));
  const others=await (await call('/api/public/payments/stripe',b.cookie)).json(); assert.ok(!others.orders.some(o=>o.id===order.id));
  assert.equal((await call('/api/public/payments/stripe',b.cookie,'POST',{id:order.id,action:'check'})).status,404);
  assert.equal((await call('/api/public/payments/stripe',a.cookie,'POST',{id:order.id,action:'check'},'https://evil.test')).status,403);
  assert.equal((await call('/api/public/payments/stripe',a.cookie,'POST',{id:order.id,action:'finalize'})).status,422);
  assert.equal((await call('/admin/payments',manager)).status,200);
  assert.equal((await call('/account/payments',a.cookie)).status,200);
  const webhook=base+'/api/public/payments/stripe/webhook', stripe=new Stripe('sk_test_signature_fixture'), secret='whsec_local_http_test';
  const payload=JSON.stringify({id:'evt_local_http_'+randomUUID(),type:'customer.created',livemode:false,data:{object:{id:'cus_local_http'}}});
  assert.equal((await fetch(webhook,{method:'POST',body:payload})).status,400);
  const signature=stripe.webhooks.generateTestHeaderString({payload,secret});
  assert.equal((await fetch(webhook,{method:'POST',body:payload,headers:{'stripe-signature':signature}})).status,200);
  assert.equal((await fetch(webhook,{method:'POST',body:payload+' ',headers:{'stripe-signature':signature}})).status,400);
  const live=payload.replace('"livemode":false','"livemode":true');
  assert.equal((await fetch(webhook,{method:'POST',body:live,headers:{'stripe-signature':stripe.webhooks.generateTestHeaderString({payload:live,secret})}})).status,400);
  console.log('STRIPE_HTTP_OK roles, ownership, CSRF, server prices, SSR pages, signed raw webhook, live rejection');
} finally { await db.$disconnect(); }
