"use client";
import { useRef, useState } from "react";
import s from "./AdsArtworkFields.module.css";
export type Artwork = { fileId: string; name: string; targetUrl: string };
export function AdsArtworkFields({ slots, labels, files, setFiles, uploading, setUploading, errors, setErrors }: { slots: string[]; labels: string[]; files: Record<string,Artwork>; setFiles: React.Dispatch<React.SetStateAction<Record<string,Artwork>>>; uploading: boolean; setUploading: (v:boolean)=>void; errors: string; setErrors:(v:string)=>void }) {
  const [dragging,setDragging]=useState<string|null>(null);
  const [active,setActive]=useState<string|null>(null);
  const lock=useRef(false);
  const inputs=useRef<Record<string,HTMLInputElement|null>>({});
  async function upload(slot:string,file:File|undefined) {
    if(!file || lock.current || uploading)return;
    const allowed=slot.startsWith("video_ad:")?["video/mp4"]:["image/jpeg","image/png","image/gif","image/webp"];
    if(!allowed.includes(file.type)){setErrors(slot.startsWith("video_ad:")?"ช่องนี้รองรับวิดีโอ MP4 เท่านั้น":"ช่องนี้รองรับรูป JPG, PNG, GIF หรือ WebP เท่านั้น");return;}
    if(file.size>20*1024*1024){setErrors("ไฟล์ต้องมีขนาดไม่เกิน 20 MB");return;}
    lock.current=true;setActive(slot);setUploading(true);setErrors("");
    try {
      const response=await fetch("/api/public/ads-attachments",{method:"POST",headers:{"Content-Type":file.type,"X-File-Name":encodeURIComponent(file.name)},body:file});
      const result=await response.json();
      if(!response.ok)throw Error(result.error==="upload_storage_unavailable"?"พื้นที่จัดเก็บยังไม่พร้อม กรุณาติดต่อทีมงาน":"อัปโหลดไม่สำเร็จ ตรวจชนิดและขนาดไฟล์ แล้วลองใหม่");
      setFiles(old=>({...old,[slot]:{fileId:result.id,name:result.name,targetUrl:old[slot]?.targetUrl || ""}}));
    }catch(error){setErrors((error as Error).message);}finally{lock.current=false;setActive(null);setUploading(false);}
  }
  return <section className={s.root}><header className={s.heading}><div><span className={s.eyebrow}>CAMPAIGN ASSETS</span><h2>เตรียมสื่อให้แคมเปญของคุณ</h2><p>แนบไฟล์ให้ตรงกับตำแหน่งที่เลือก แล้วเพิ่มลิงก์สำหรับผู้ชมที่คลิกโฆษณา</p></div><span className={s.counter}>{slots.filter(slot=>files[slot]?.fileId).length} / {slots.length} ไฟล์พร้อมแล้ว</span></header><div className={s.explain}><span aria-hidden="true">↗</span><p><strong>โฆษณาแสดงบนเว็บไซต์ที่คุณเลือก</strong><br />ลิงก์ในแต่ละรายการด้านล่างคือเว็บไซต์ของคุณที่ผู้ชมจะไปหลังคลิกป้าย</p></div>{errors && <p role="alert" className={s.error}>{errors}</p>}<div className={s.cards}>{slots.map((slot,index)=>{const video=slot.startsWith("video_ad:");const file=files[slot];return <article className={s.card} key={slot}><div className={s.cardHeading}><span className={s.number}>{String(index+1).padStart(2,"0")}</span><div><h3>{labels[index]}</h3><small>{video?"วิดีโอก่อนเล่นเนื้อหา":"ป้ายโฆษณาแบบรูปภาพ"}</small></div><span className={file?.fileId?s.complete:s.pending}>{file?.fileId?"✓ แนบแล้ว":"รอไฟล์"}</span></div><div aria-label={"พื้นที่สื่อ "+labels[index]} aria-busy={active===slot} className={`${s.dropzone} ${file?.fileId?s.hasPreview:""} ${dragging===slot?s.dragging:""} ${uploading?s.disabled:""}`} onDragOver={event=>{event.preventDefault();if(!uploading)setDragging(slot);}} onDragLeave={event=>{if(!event.currentTarget.contains(event.relatedTarget as Node))setDragging(null);}} onDrop={event=>{event.preventDefault();setDragging(null);if(event.dataTransfer.files.length!==1){setErrors("กรุณาวางครั้งละ 1 ไฟล์สำหรับแต่ละช่อง");return;}void upload(slot,event.dataTransfer.files[0]);}}><input ref={element=>{inputs.current[slot]=element;}} type="file" aria-label={`แนบไฟล์ ${labels[index]}`} disabled={uploading} accept={video?"video/mp4":"image/jpeg,image/png,image/gif,image/webp"} onChange={event=>{void upload(slot,event.target.files?.[0]);event.target.value="";}} />{file?.fileId ? <><ArtworkPreview key={file.fileId} file={file} video={video} label={labels[index] || slot} /><div className={s.previewToolbar}><div><strong>{active===slot?"กำลังอัปโหลดไฟล์ใหม่…":"ตัวอย่างไฟล์ที่แนบ"}</strong><small>ลากไฟล์ใหม่มาวางเพื่อแทนที่ · {video?"MP4":"JPG, PNG, GIF, WebP"} สูงสุด 20 MB</small></div><button type="button" className="ui-button" disabled={uploading} onClick={()=>inputs.current[slot]?.click()} aria-label={"เปลี่ยนไฟล์ "+labels[index]}>↻ เปลี่ยนไฟล์</button></div>{(active===slot||dragging===slot)&&<div className={s.previewOverlay} role="status">{active===slot?"กำลังอัปโหลดไฟล์ใหม่…":"วางไฟล์เพื่อแทนที่"}</div>}</> : <button type="button" className={s.emptyPicker} disabled={uploading} onClick={()=>inputs.current[slot]?.click()} aria-label={"เลือกไฟล์ "+labels[index]}><span className={s.uploadIcon} aria-hidden="true">{active===slot?"◌":video?"▷":"↑"}</span><strong>{active===slot?"กำลังอัปโหลด…":dragging===slot?"วางไฟล์ที่นี่":"ลากไฟล์มาวางที่นี่"}</strong><span className={s.browse}>หรือคลิกเพื่อเลือกไฟล์</span><small>{video?"MP4":"JPG, PNG, GIF, WebP"} · สูงสุด 20 MB</small></button>}</div>{file?.fileId && <div className={s.file} role="status"><span aria-hidden="true">✓</span><strong>{file.name}</strong><a href={`/api/public/ads-attachments?id=${file.fileId}`}>ตรวจไฟล์ ↗</a></div>}<label className={s.destination}>ลิงก์เมื่อคลิกโฆษณา<span className={s.inputWrap}><span aria-hidden="true">↗</span><input type="url" required maxLength={2000} placeholder="https://your-brand.com/promotion" value={file?.targetUrl||""} onChange={e=>setFiles(old=>({...old,[slot]:{fileId:old[slot]?.fileId||"",name:old[slot]?.name||"",targetUrl:e.target.value}}))}/></span></label><p className={s.help}>ใช้ลิงก์ HTTPS ของแบรนด์ สินค้า หรือหน้าข้อเสนอของคุณ</p></article>;})}</div></section>;
}

function ArtworkPreview({file,video,label}:{file:Artwork;video:boolean;label:string}) {
  const [failed,setFailed]=useState(false);
  const source="/api/public/ads-attachments?id="+encodeURIComponent(file.fileId)+"&preview=1";
  return <div className={s.previewFrame}>{failed?<div className={s.previewFallback} role="status"><strong>แสดงตัวอย่างไฟล์ไม่ได้</strong><p>ไฟล์ยังแนบอยู่ คุณสามารถดาวน์โหลดเพื่อตรวจสอบหรือเปลี่ยนไฟล์ใหม่ได้</p></div>:video?<video controls playsInline preload="metadata" src={source} aria-label={"ตัวอย่างวิดีโอ "+label} onError={()=>setFailed(true)}/>:<ArtworkImage source={source} label={label} name={file.name} onError={()=>setFailed(true)}/>}</div>;
}
function ArtworkImage({source,label,name,onError}:{source:string;label:string;name:string;onError:()=>void}) {
  // Native images preserve animated GIFs and authenticated private file requests.
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={source} alt={"ตัวอย่าง "+label+": "+name} draggable={false} onError={onError}/>;
}
