import assert from 'node:assert/strict';
const base='http://localhost:3318';
const request=(path,options={})=>fetch(base+path,{...options,signal:AbortSignal.timeout(180000)});
const jar=new Map();const collect=r=>r.headers.getSetCookie().forEach(c=>{const [k,...v]=c.split(';')[0].split('=');jar.set(k,v.join('='));});const cookie=()=>[...jar].map(([k,v])=>k+'='+v).join('; ');
assert.equal((await request('/api/site-analytics')).status,401);
assert.equal((await request('/api/cron/site-analytics',{method:'POST'})).status,401);
const csrf=await request('/api/auth/csrf');collect(csrf);const {csrfToken}=await csrf.json();
const login=await request('/api/auth/callback/credentials',{method:'POST',redirect:'manual',headers:{cookie:cookie(),'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({email:'stripe-manager@example.test',password:'Local-stripe-test-only-2026',csrfToken,callbackUrl:base+'/admin'})});collect(login);
const headers={cookie:cookie(),origin:base,'Content-Type':'application/json'};
const response=await request('/api/site-analytics',{headers});assert.equal(response.status,200);const data=await response.json();assert.ok(Array.isArray(data.sites));for(const site of data.sites){assert.ok(!('credentialEnc' in site));assert.ok(!('private_key' in site));}
assert.equal((await request('/api/site-analytics',{method:'POST',headers:{...headers,origin:'https://evil.test'},body:JSON.stringify({siteId:'not-used'})})).status,403);
assert.equal((await request('/admin/analytics',{headers})).status,200);
console.log('ANALYTICS_HTTP_PASS anonymous+cron protection, admin read, CSRF, no credential leak, rendered page; sites='+data.sites.length);
