"use client";
import { useEffect, useState } from "react";
import { Alert, Button, Stack, TextField } from "@mui/material";
import { apiFetch } from "@/lib/api-client";
export function AdsWebsiteKey({id,configured}:{id:string;configured?:boolean}){
 const [key,setKey]=useState<string|null>(null),[ready,setReady]=useState(configured),[busy,setBusy]=useState(false),[error,setError]=useState(""),[notice,setNotice]=useState("");
 useEffect(()=>{
  if(configured!==undefined)return;
  let active=true;setBusy(true);
  apiFetch<{configured:boolean}>(`/api/ads-websites/${encodeURIComponent(id)}/key`,{method:"POST",body:JSON.stringify({action:"status"})})
  .then(r=>{if(active)setReady(r.configured);})
  .catch(()=>{if(active)setError("กรุณาบันทึกเว็บไซต์ก่อน แล้วโหลดหน้าใหม่เพื่อตรวจสอบคีย์");})
  .finally(()=>{if(active)setBusy(false);});
  return()=>{active=false;};
 },[id,configured]);
 useEffect(()=>{if(!key)return;const hide=()=>setKey(null);const timer=setTimeout(hide,60000);window.addEventListener("blur",hide);return()=>{clearTimeout(timer);window.removeEventListener("blur",hide);};},[key]);
 async function load(action:"generate"|"reveal"){
  setBusy(true);setError("");setNotice("");
  try{const result=await apiFetch<{key:string}>(`/api/ads-websites/${encodeURIComponent(id)}/key`,{method:"POST",body:JSON.stringify({action})});setKey(result.key);setReady(true);}catch(e){setError(e instanceof Error?e.message:"ดำเนินการไม่สำเร็จ");}finally{setBusy(false);}
 }
 async function copy(value:string){try{await navigator.clipboard.writeText(value);setNotice("คัดลอกแล้ว");}catch{setError("คัดลอกไม่ได้ กรุณาเลือกข้อความและคัดลอกด้วยตนเอง");}}
 return <Stack spacing={1.5} sx={{mt:2}}>
 <TextField label="คีย์เฉพาะเว็บไซต์" type={key?"text":"password"} value={key??(ready?"••••••••••••••••":"")} slotProps={{input:{readOnly:true}}} helperText="ซ่อนอัตโนมัติภายใน 60 วินาทีหรือเมื่อออกจากหน้าต่าง ห้ามส่งคีย์ในแชต"/>
 <Stack direction="row" sx={{gap:1,flexWrap:"wrap"}}>
 <Button variant="contained" disabled={busy||ready!==false} onClick={()=>load("generate")}>Generate key</Button>
 <Button variant="outlined" disabled={busy||ready!==true} onClick={()=>key?setKey(null):load("reveal")}>{key?"ซ่อนคีย์":"แสดงคีย์"}</Button>
 <Button disabled={!key||busy} onClick={()=>key&&copy(key)}>คัดลอกคีย์</Button>
 </Stack>
 {ready&&<Alert severity="info">ใช้คีย์นี้กับ Website ID ด้านบนในปลั๊กอิน AURUM Ads เว็บไซต์นี้เท่านั้น</Alert>}
 {error&&<Alert severity="error">{error}</Alert>}{notice&&<Alert severity="success">{notice}</Alert>}
 </Stack>;
}
