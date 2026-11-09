import { createSign } from 'node:crypto';
import { z } from 'zod';
import { searchSnapshotSchema } from './site-analytics-contract';
const accountSchema=z.object({client_email:z.string().email(),private_key:z.string().min(100)});
const bindingSchema=z.object({property:z.string().min(3),account:z.string().default('default')});
export function searchBinding(siteId:string){
 const bindings=z.record(z.string(),bindingSchema).parse(JSON.parse(process.env.SEARCH_CONSOLE_PROPERTIES_JSON||'{}'));
 return bindings[siteId]??null;
}
export async function fetchSearchConsole(siteId:string){
 const binding=searchBinding(siteId);if(!binding)throw Error('not_configured');
 const accounts=z.record(z.string(),accountSchema).parse(JSON.parse(process.env.SEARCH_CONSOLE_ACCOUNTS_JSON||'{}'));
 const account=accounts[binding.account];if(!account)throw Error('account_not_configured');
 const now=Math.floor(Date.now()/1000);
 const enc=(data:unknown)=>Buffer.from(JSON.stringify(data)).toString('base64url');
 const unsigned=enc({alg:'RS256',typ:'JWT'})+'.'+enc({iss:account.client_email,scope:'https://www.googleapis.com/auth/webmasters.readonly',aud:'https://oauth2.googleapis.com/token',iat:now,exp:now+3600});
 const signer=createSign('RSA-SHA256');signer.update(unsigned);signer.end();
 const assertion=unsigned+'.'+signer.sign(account.private_key,'base64url');
 const tokenResponse=await fetch('https://oauth2.googleapis.com/token',{method:'POST',redirect:'error',signal:AbortSignal.timeout(15000),headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({grant_type:'urn:ietf:params:oauth:grant-type:jwt-bearer',assertion})});
 if(!tokenResponse.ok)throw Error(`google_auth_${tokenResponse.status}`);
 const token=z.object({access_token:z.string()}).parse(await tokenResponse.json()).access_token;
 // Completed data only; Search Console is delayed and dates use Google's reporting calendar.
 const to=new Date(Date.now()-3*86400000).toISOString().slice(0,10);
 const from=new Date(Date.parse(to)-27*86400000).toISOString().slice(0,10);
 const response=await fetch(`https://www.googleapis.com/webmasters/v3/sites/${encodeURIComponent(binding.property)}/searchAnalytics/query`,{method:'POST',redirect:'error',signal:AbortSignal.timeout(20000),headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json'},body:JSON.stringify({startDate:from,endDate:to,dimensions:['query'],rowLimit:10,type:'web',dataState:'final'})});
 if(!response.ok)throw Error(`search_console_${response.status}`);
 const data=z.object({rows:z.array(z.object({keys:z.array(z.string()).length(1),clicks:z.number(),impressions:z.number(),ctr:z.number(),position:z.number()})).max(10).optional()}).parse(await response.json());
 return searchSnapshotSchema.parse({from,to,property:binding.property,rows:(data.rows||[]).map(r=>({query:r.keys[0],clicks:r.clicks,impressions:r.impressions,ctr:r.ctr,position:r.position})).sort((a,b)=>b.clicks-a.clicks||b.impressions-a.impressions)});
}
