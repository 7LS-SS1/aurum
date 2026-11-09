import {readdir,readFile,stat} from "node:fs/promises";
import path from "node:path";
// Read-only inventory. Never deletes attachments, including legacy/unknown files.
async function main(){
 if(!process.env.DATABASE_URL||!process.env.ADS_UPLOAD_DIR||!path.isAbsolute(process.env.ADS_UPLOAD_DIR))throw Error("Explicit DATABASE_URL and absolute ADS_UPLOAD_DIR required");
 const {prisma}=await import("../src/lib/prisma");
 try{
  const refs=new Set<string>();
  function scan(v:unknown){if(typeof v==="string"&&/^[a-f0-9-]{36}$/i.test(v))refs.add(v);else if(Array.isArray(v))v.forEach(scan);else if(v&&typeof v==="object")Object.values(v).forEach(scan);}
  let cursor:string|undefined;
  do{const rows=await prisma.adsOrder.findMany({select:{id:true,quote:true,currentArtwork:true},take:200,orderBy:{id:"asc"},...(cursor?{cursor:{id:cursor},skip:1}:{})});rows.forEach(scan);cursor=rows.length===200?rows.at(-1)!.id:undefined;}while(cursor);
  const changes=await prisma.adsArtworkRequest.findMany({select:{fileId:true}});changes.forEach(scan);
  const tickets=await prisma.adsTicketMessage.findMany({select:{files:true}});tickets.forEach(scan);
  const report:{id:string;bytes:number;classification:string}[]=[];
  for(const entry of await readdir(process.env.ADS_UPLOAD_DIR)){if(!/^[a-f0-9-]{36}\.json$/i.test(entry))continue;const id=entry.slice(0,-5);try{const data=JSON.parse(await readFile(path.join(process.env.ADS_UPLOAD_DIR,entry),"utf8"));const info=await stat(path.join(process.env.ADS_UPLOAD_DIR,id+".bin"));report.push({id,bytes:info.size,classification:refs.has(id)?"referenced":typeof data.createdAt!=="string"?"legacy-retain":Date.parse(data.createdAt)>Date.now()-30*86400000?"recent-retain":"unreferenced-review-only"});}catch{report.push({id,bytes:0,classification:"unknown-retain"});}}
  console.log(JSON.stringify({readOnly:true,totalFiles:report.length,totalBytes:report.reduce((n,r)=>n+r.bytes,0),files:report},null,2));
 }finally{await prisma.$disconnect();}
}
main().catch(e=>{console.error(e.message);process.exitCode=1;});
