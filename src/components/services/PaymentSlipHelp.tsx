"use client";
import { useState } from "react";
import s from "./SimulatedCheckout.module.css";
export function PaymentSlipHelp({id,amount,expanded=false}:{id:string;amount:number;expanded?:boolean}) {
 const [message,setMessage]=useState("");
 async function copy(){try{await navigator.clipboard.writeText(id);setMessage("คัดลอกหมายเลขคำสั่งซื้อแล้ว");}catch{setMessage("คัดลอกไม่สำเร็จ กรุณาเลือกและคัดลอกหมายเลขด้านบน");}}
 return <details className={s.receipt} open={expanded}>
  <summary style={{cursor:"pointer",fontWeight:700,color:"#e7c789"}}>แจ้งสลิปชำระเงิน</summary>
  <p>หาก PromptPay มีปัญหา หรือชำระแล้วแต่สถานะยังไม่อัปเดต สามารถส่งหลักฐานให้แอดมินตรวจสอบได้</p>
  <div><small>หมายเลขคำสั่งซื้อ</small><code style={{display:"block",overflowWrap:"anywhere",userSelect:"text"}}>{id}</code><button type="button" className="ui-button" onClick={copy}>คัดลอกหมายเลขคำสั่งซื้อ</button></div>
  <p>ยอดตามคำสั่งซื้อ: <strong>{amount.toLocaleString("th-TH",{minimumFractionDigits:2,maximumFractionDigits:2})} บาท</strong></p>
  <ol style={{paddingLeft:24,lineHeight:1.9}}><li>แจ้งหมายเลขคำสั่งซื้อให้แอดมิน</li><li>แนบสลิปที่ชำระค่าบริการให้แอดมินผ่านช่องทางติดต่อด้านล่าง โดยให้เห็นยอดเงิน วันเวลา และเลขอ้างอิงชัดเจน</li><li>รอแอดมินตรวจสอบและยืนยันการชำระเงิน จากนั้นทีมงานจะดำเนินการตามขั้นตอนของคำสั่งซื้อ</li></ol>
  <a className="ui-button ui-button--primary" href="https://t.me/thaitubevideo" target="_blank" rel="noopener noreferrer">แจ้งสลิปชำระเงินกับแอดมิน ↗</a>
  <p className={s.muted}>หากชำระแล้ว ไม่ต้องชำระซ้ำ หากยังไม่ได้ชำระ กรุณาสอบถามช่องทางและยอดที่ต้องชำระกับแอดมินก่อนโอน</p>
  <p className={s.muted}>การส่งสลิปยังไม่ถือว่ายืนยันการชำระเงินหรือเริ่มบริการ จนกว่าแอดมินตรวจสอบและดำเนินการในระบบ</p>
  {message&&<p role="status">{message}</p>}
 </details>;
}
