import { prisma } from './prisma';
import { decrypt } from './crypto';
import { siteSnapshotSchema, searchSnapshotSchema, type SiteReport } from './site-analytics-contract';
import { fetchSearchConsole } from './search-console';
function safeError(e:unknown){const message=e instanceof Error?e.message:'';return /^(wp_http_\d+|search_console_\d+|google_auth_\d+|not_configured|account_not_configured|https_required|invalid_snapshot)$/.test(message)?message:'connection_or_format_error';}
export async function readSiteAnalytics():Promise<SiteReport[]> {
 const sites=await prisma.targetSite.findMany({select:{id:true,name:true,baseUrl:true,isActive:true,analytics:true},orderBy:{name:'asc'}});
 return sites.map(site=>{const a=site.analytics;const snapshot=siteSnapshotSchema.safeParse(a?.snapshot);const search=searchSnapshotSchema.safeParse(a?.search);return {id:site.id,name:site.name,baseUrl:site.baseUrl,isActive:site.isActive,snapshot:snapshot.success?snapshot.data:null,syncedAt:a?.syncedAt?.toISOString()??null,error:a?.error??null,search:search.success?search.data:null,searchError:a?.searchError??null,searchSyncedAt:a?.searchSyncedAt?.toISOString()??null};});
}
export async function syncSiteAnalytics(siteId:string) {
 const site=await prisma.targetSite.findUniqueOrThrow({where:{id:siteId}});
 if(!site.isActive)throw Error('inactive_site');
 const previous=await prisma.siteAnalytics.findUnique({where:{siteId}});
 // Atomically claim a site for five minutes; a crashed collector can be retried.
 await prisma.siteAnalytics.upsert({where:{siteId},create:{siteId},update:{}});
 const claim=await prisma.siteAnalytics.updateMany({where:{siteId,OR:[{attemptedAt:null},{attemptedAt:{lt:new Date(Date.now()-300000)}}]},data:{attemptedAt:new Date()}});
 if(!claim.count)return {siteId,skipped:true};
 try {
   const url=new URL(site.baseUrl);if(url.protocol!=='https:' || url.username || url.password)throw Error('https_required');
   const credential=decrypt({ciphertext:site.credentialEnc,iv:site.credentialIv,tag:site.credentialTag});
   const authorization=site.authType==='JWT'?`Bearer ${credential}`:`Basic ${Buffer.from(`${site.wpUsername}:${credential}`).toString('base64')}`;
   const response=await fetch(site.baseUrl.replace(/\/$/,'')+'/wp-json/aurum-analytics/v1/snapshot',{headers:{Authorization:authorization},redirect:'error',cache:'no-store',signal:AbortSignal.timeout(20000)});
   if(!response.ok)throw Error(`wp_http_${response.status}`);
   const snapshot=siteSnapshotSchema.parse(await response.json());
   const today=new Date().toISOString().slice(0,10);
   if(snapshot.to!==today || snapshot.from!==new Date(Date.now()-27*86400000).toISOString().slice(0,10))throw Error('invalid_snapshot');
   await prisma.siteAnalytics.update({where:{siteId},data:{snapshot,syncedAt:new Date(),error:null}});
 }catch(e){await prisma.siteAnalytics.update({where:{siteId},data:{error:safeError(e)}});}
 if(!previous?.searchSyncedAt || Date.now()-previous.searchSyncedAt.getTime()>12*3600000){
   try{const search=await fetchSearchConsole(siteId);await prisma.siteAnalytics.update({where:{siteId},data:{search,searchSyncedAt:new Date(),searchError:null}});}
   catch(e){await prisma.siteAnalytics.update({where:{siteId},data:{searchError:safeError(e)}});}
 }
 return {siteId,skipped:false};
}
export async function syncNextAnalyticsSite(){
 const sites=await prisma.targetSite.findMany({where:{isActive:true},select:{id:true,analytics:{select:{attemptedAt:true}}}});
 sites.sort((a,b)=>(a.analytics?.attemptedAt?.getTime()??0)-(b.analytics?.attemptedAt?.getTime()??0));
 if(!sites.length)return {skipped:true};
 return syncSiteAnalytics(sites[0]!.id);
}
