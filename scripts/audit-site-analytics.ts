/** Read-only audit: no publishing, database updates, or event generation. */
import {loadEnvConfig} from '@next/env';
import {mkdir,writeFile} from 'node:fs/promises';
loadEnvConfig(process.cwd());
async function main(){
 const {prisma}=await import('../src/lib/prisma');const {decrypt}=await import('../src/lib/crypto');
 try{
 const sites=await prisma.targetSite.findMany({select:{id:true,name:true,baseUrl:true,isActive:true,authType:true,wpUsername:true,credentialEnc:true,credentialIv:true,credentialTag:true}});
 const results=[];
 for(const site of sites){
 let status='inactive';
 if(site.isActive){try{
 const url=new URL(site.baseUrl);
 if(url.protocol!=='https:'||url.username||url.password||url.hostname==='example.com'){status='skipped_nonproduction_or_invalid_url';}
 else{const secret=decrypt({ciphertext:site.credentialEnc,iv:site.credentialIv,tag:site.credentialTag});const auth=site.authType==='JWT'?`Bearer ${secret}`:`Basic ${Buffer.from(`${site.wpUsername}:${secret}`).toString('base64')}`;
 const response=await fetch(site.baseUrl.replace(/\/$/,'')+'/wp-json/aurum-analytics/v1/snapshot',{headers:{Authorization:auth},redirect:'error',signal:AbortSignal.timeout(8000)});status=`HTTP ${response.status}`;}
 }catch{status='connection_or_credential_error';}}
 results.push({id:site.id,name:site.name,url:site.baseUrl,status});
 }
 await mkdir('artifacts',{recursive:true});await writeFile('artifacts/site-analytics-audit.json',JSON.stringify({auditedAt:new Date().toISOString(),sites:results},null,2));
 console.log(JSON.stringify({count:results.length,sites:results}));
 }finally{await prisma.$disconnect();}}
main().catch(()=>{console.error('Read-only registry audit failed; check database connectivity. No data changed.');process.exitCode=1;});
