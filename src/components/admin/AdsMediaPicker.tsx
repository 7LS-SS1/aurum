"use client";
import { useEffect, useRef, useState } from "react";
import { Alert, Box, Button, LinearProgress, Stack, TextField, Typography } from "@mui/material";
import { apiFetch } from "@/lib/api-client";
import { presignAndUpload } from "@/lib/upload-client";
import { resolveUploadContentType } from "@/lib/upload-queue";

type Media = {url:string;name:string;type:string};
export function AdPreview({url,video=false}:{url:string;video?:boolean}) {
  const [failed,setFailed]=useState(false);
  useEffect(()=>setFailed(false),[url]);
  if(!url) return null;
  try { if(new URL(url).protocol!=="https:") return null; } catch {return null;}
  if(failed) return <Alert severity="warning">ไม่สามารถโหลดตัวอย่างไฟล์ได้</Alert>;
  return <Box sx={{p:1,bgcolor:"background.default",borderRadius:2,textAlign:"center"}}>{video?<video src={url} controls preload="metadata" onError={()=>setFailed(true)} style={{maxWidth:"100%",maxHeight:220}}/>:<Box component="img" src={url} alt="ตัวอย่างป้ายโฆษณา" loading="lazy" onError={()=>setFailed(true)} sx={{maxWidth:"100%",maxHeight:220,objectFit:"contain"}}/>}</Box>;
}
export function AdsMediaPicker({video,url,onChange,onBusy}:{video:boolean;url:string;onChange:(url:string)=>void;onBusy:(busy:boolean)=>void}) {
  const [items,setItems]=useState<Media[]>([]),[show,setShow]=useState(false),[query,setQuery]=useState(""),[error,setError]=useState(""),[progress,setProgress]=useState<number|null>(null),[drag,setDrag]=useState(false),[loading,setLoading]=useState(false);
  const uploading=useRef(false);
  async function load(){setLoading(true);setError("");try{setItems((await apiFetch<{items:Media[]}>("/api/ads-media")).items);}catch(e){setError(e instanceof Error?e.message:"โหลดคลังไม่สำเร็จ");}finally{setLoading(false);}}
  async function upload(files:FileList|null){
    if(!files?.length||uploading.current)return;
    if(files.length!==1){setError("เลือกครั้งละ 1 ไฟล์");return;}
    const file=files[0]; if(!file)return; const type=resolveUploadContentType(file);
    if(video?type!=="video/mp4":!["image/png","image/jpeg","image/webp","image/gif"].includes(type)){setError(video?"เลือกไฟล์ MP4":"เลือกไฟล์ JPG, PNG, WebP หรือ GIF");return;}
    if(file.size<=0||file.size>(video?20*1024*1024*1024:15*1024*1024)){setError(video?"ไฟล์ต้องมีขนาดไม่เกิน 20 GB":"ไฟล์ต้องมีขนาดไม่เกิน 15 MB");return;}
    uploading.current=true;onBusy(true);setProgress(0);setError("");
    try{
      const uploaded=await presignAndUpload(file,"r2",setProgress);
      onChange(uploaded);
      try{await apiFetch("/api/ads-media",{method:"POST",body:JSON.stringify({url:uploaded,name:file.name,type,size:file.size})});await load();}
      catch{setError("อัปโหลดสำเร็จ แต่เพิ่มเข้าคลังไม่สำเร็จ สามารถบันทึกป้ายนี้ได้ แล้วเปิดคลังอีกครั้ง");}
    }catch(e){setError(e instanceof Error?e.message:"อัปโหลดไม่สำเร็จ");}
    finally{uploading.current=false;onBusy(false);setProgress(null);}
  }
  const filtered=items.filter(item=>(video?item.type==="video/mp4":item.type.startsWith("image/"))&&item.name.toLowerCase().includes(query.toLowerCase()));
  return <Stack spacing={2}>
    <AdPreview url={url} video={video}/>
    <Box onDragOver={e=>{e.preventDefault();if(!uploading.current)setDrag(true);}} onDragLeave={()=>setDrag(false)} onDrop={e=>{e.preventDefault();setDrag(false);void upload(e.dataTransfer.files);}} sx={{border:"2px dashed",borderColor:drag?"primary.main":"divider",bgcolor:drag?"action.hover":"transparent",borderRadius:2,p:3,textAlign:"center"}}>
      <Typography>ลากไฟล์มาวางที่นี่ หรือเลือกไฟล์จากเครื่อง</Typography>
      <Typography variant="caption">{video?"MP4 · ไม่เกิน 20 GB":"JPG / PNG / WebP / GIF · ไม่เกิน 15 MB"}</Typography>
      <Box sx={{mt:1}}><Button component="label" variant="outlined" disabled={progress!==null}>เลือกไฟล์<input type="file" hidden accept={video?"video/mp4":"image/jpeg,image/png,image/webp,image/gif"} onChange={e=>{void upload(e.target.files);e.target.value="";}}/></Button></Box>
    </Box>
    {progress!==null&&<Box><LinearProgress variant="determinate" value={progress}/><Typography variant="caption">กำลังอัปโหลด {Math.round(progress)}%</Typography></Box>}
    {error&&<Alert severity="error">{error}</Alert>}
    <Button disabled={progress!==null} onClick={()=>{setShow(!show);if(!show)void load();}}>{show?"ปิดคลัง":"เลือกจากคลังป้ายที่เคยอัปโหลด"}</Button>
    {show&&<Stack spacing={2}><TextField size="small" label="ค้นหาชื่อไฟล์หรือป้าย" value={query} onChange={e=>setQuery(e.target.value)}/><Button disabled={loading} onClick={load}>โหลดคลังใหม่</Button>{loading&&<LinearProgress/>}<Box sx={{display:"grid",gridTemplateColumns:"repeat(2,minmax(0,1fr))",gap:1,maxHeight:360,overflowY:"auto"}}>{filtered.map(item=><Box key={item.url} sx={{border:"1px solid",borderColor:item.url===url?"primary.main":"divider",borderRadius:2,p:1}}><AdPreview url={item.url} video={video}/><Typography variant="caption" sx={{overflowWrap:"anywhere"}}>{item.name}</Typography><Button fullWidth disabled={progress!==null} onClick={()=>{onChange(item.url);setShow(false);}}>เลือกไฟล์นี้</Button></Box>)}</Box>{!loading&&!error&&!filtered.length&&<Typography>ไม่พบไฟล์ในคลังสำหรับตำแหน่งนี้</Typography>}</Stack>}
  </Stack>;
}
