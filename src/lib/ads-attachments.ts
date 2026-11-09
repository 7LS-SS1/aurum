import { mkdir, readFile, writeFile, readdir, unlink } from "node:fs/promises";
import sharp from "sharp";
import { prisma } from "./prisma";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { ApiError } from "./api-response";
import { attachmentStorageIsR2, readR2AttachmentMetadata, readR2AttachmentBytes, saveR2Attachment } from "./storage/attachment-r2";
export const attachmentLimit = 20 * 1024 * 1024;
const metadata = z.object({ id: z.string().uuid(), owner: z.string(), name: z.string(), type: z.string(), size: z.number() });
function directory() {
  const configured = process.env.ADS_UPLOAD_DIR;
  if (configured && path.isAbsolute(configured)) return configured;
  if (process.env.NODE_ENV !== "production") return path.join(process.cwd(), ".local-ads-uploads");
  throw new ApiError("upload_storage_unavailable", 503);
}
export async function readAttachment(id: string) {
  z.string().uuid().parse(id);
  if (attachmentStorageIsR2()) {
    const remote = await readR2AttachmentMetadata(id);
    if (remote) return metadata.parse(remote);
    if (!process.env.ADS_UPLOAD_DIR) throw new ApiError("attachment_not_found", 404);
  }
  try { return metadata.parse(JSON.parse(await readFile(path.join(directory(), id + ".json"), "utf8"))); }
  catch (error) { if (error instanceof ApiError) throw error; throw new ApiError("attachment_not_found", 404); }
}
export async function attachmentBytes(id: string) {
  z.string().uuid().parse(id);
  if (attachmentStorageIsR2()) {
    const remote = await readR2AttachmentMetadata(id);
    if (remote) return readR2AttachmentBytes(metadata.parse(remote));
    if (!process.env.ADS_UPLOAD_DIR) throw new ApiError("attachment_not_found", 404);
  }
  return readFile(path.join(directory(), id + ".bin"));
}
export async function saveAttachment(req: Request, owner: string) {
  const r2 = attachmentStorageIsR2();
  const dir = !r2 || process.env.ADS_UPLOAD_DIR ? directory() : null;
  const declared = Number(req.headers.get("content-length"));
  if (declared > attachmentLimit) throw new ApiError("file_too_large",413);
  const reader = req.body?.getReader(); if (!reader) throw new ApiError("file_required", 422);
  const chunks: Uint8Array[] = []; let size = 0;
  try { while (true) { const part = await reader.read(); if (part.done) break; size += part.value.length; if (size > attachmentLimit) { await reader.cancel(); throw new ApiError("file_too_large", 413); } chunks.push(part.value); } } finally { reader.releaseLock(); }
  const bytes = Buffer.concat(chunks);
  if (declared > 0 && declared !== bytes.length) throw new ApiError("incomplete_upload",422);
  let type = "";
  if (bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]))) type="image/png";
  else if (bytes[0]===255 && bytes[1]===216 && bytes[2]===255) type="image/jpeg";
  else if (["GIF87a","GIF89a"].includes(bytes.toString("ascii",0,6))) type="image/gif";
  else if (bytes.toString("ascii",0,4)==="RIFF" && bytes.toString("ascii",8,12)==="WEBP") type="image/webp";
  else if (bytes.length >= 12 && bytes.toString("ascii",4,8)==="ftyp" && ["isom","iso2","mp41","mp42","avc1","M4V "].includes(bytes.toString("ascii",8,12))) type="video/mp4";
  if (!type || req.headers.get("content-type") !== type) throw new ApiError("unsupported_file", 422);
  try {
    if(type.startsWith("image/")) {
      const image=sharp(bytes,{limitInputPixels:40000000,failOn:"error"});
      const info=await image.metadata();
      if(!info.width||!info.height||info.width>16000||info.height>16000||(info.pages||1)>300)throw Error();
      await image.resize(1,1).raw().toBuffer();
    } else {
      const boxes=new Set<string>();let offset=0;
      while(offset+8<=bytes.length){let length=bytes.readUInt32BE(offset);const box=bytes.toString("ascii",offset+4,offset+8);let header=8;if(length===1){if(offset+16>bytes.length)throw Error();const big=bytes.readBigUInt64BE(offset+8);if(big>BigInt(bytes.length))throw Error();length=Number(big);header=16;}if(length===0)length=bytes.length-offset;if(length<header||offset+length>bytes.length)throw Error();boxes.add(box);offset+=length;}
      if(offset!==bytes.length||!boxes.has("moov")||!boxes.has("mdat"))throw Error();
    }
  }catch{throw new ApiError("invalid_media",422);}
  let name: string; try { name=decodeURIComponent(req.headers.get("x-file-name") || "artwork").replace(/[\r\n\\/]/g,"_").slice(0,200); } catch { throw new ApiError("invalid_filename",422); }
  const file = { id: randomUUID(), owner, name, type, size };
  if (dir && !r2) await mkdir(dir,{recursive:true});
  await prisma.$transaction(async tx=>{
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${owner}), 81)`;
    let used=0;
    const entries = dir ? await readdir(dir).catch(error => { if (r2 && error.code === "ENOENT") return []; throw error; }) : [];
    for(const entry of entries){if(!/^[a-f0-9-]{36}\.json$/.test(entry))continue;const existing=metadata.safeParse(JSON.parse(await readFile(path.join(dir!,entry),"utf8")));if(existing.success&&existing.data.owner===owner)used+=existing.data.size;}
    const configured=Number(process.env.ADS_UPLOAD_QUOTA_MB||1024);
    const quota=Number.isFinite(configured)&&configured>=20?configured*1024*1024:1024*1024*1024;
    if(used+size>quota)throw new ApiError("upload_quota_exceeded",413);
    if (r2) { await saveR2Attachment(file, bytes, quota - used); return; }
    await writeFile(path.join(dir!,file.id+".bin"),bytes,{flag:"wx"});
    try{await writeFile(path.join(dir!,file.id+".json"),JSON.stringify({...file,createdAt:new Date().toISOString()}),{flag:"wx"});}
    catch(error){await unlink(path.join(dir!,file.id+".bin")).catch(()=>{});throw error;}
  },{maxWait:10000,timeout:r2 ? 60000 : 15000});
  return file;
}
