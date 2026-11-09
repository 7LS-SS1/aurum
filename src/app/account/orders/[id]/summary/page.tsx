import {notFound,redirect} from "next/navigation";
import {z} from "zod";
import {prisma} from "@/lib/prisma";
import {getViewerFromCookies} from "@/lib/viewer-auth";
import {requireMinRole} from "@/lib/authz";
import {statusLabels} from "@/lib/ads-booking";
import {getSimulation} from "@/lib/ads-simulation";
import {getPromptPay} from "@/lib/promptpay";
import {slotLabel} from "@/lib/ads-order-groups";
import {PrintOrderButton} from "@/components/services/PrintOrderButton";
export const dynamic="force-dynamic";
export const metadata={title:"สรุปคำสั่งซื้อ | AURUM",robots:{index:false,follow:false}};
export default async function Page({params,searchParams}:{params:Promise<{id:string}>;searchParams:Promise<{admin?:string}>}){
 const {id}=await params;if(!z.string().uuid().safeParse(id).success)notFound();
 const admin=(await searchParams).admin==="1";const viewer=admin?(await requireMinRole("MANAGER"),null):await getViewerFromCookies();
 if(!admin&&!viewer)redirect(`/login?callbackUrl=${encodeURIComponent(`/account/orders/${id}/summary`)}`);
 const order=await prisma.adsOrder.findFirst({where:{id,...(viewer?{viewerId:viewer.id}:{})}});if(!order)notFound();
 const customer=order.customer as {name:string;email?:string;contact?:string};const quote=order.quote as {website?:{name:string;url:string};lines?:{label:string;quantity:number;unitPrice:number;amount:number}[];terms?:{version:string;acceptedAt:string}};
 const date=(v:Date|null)=>v?v.toLocaleString("th-TH",{timeZone:"Asia/Bangkok"}):"ยังไม่เริ่มสัญญา";
 return <main className="order-document ui-panel"><style>{`.order-document{max-width:1000px;margin:2rem auto}.order-document table{width:100%;border-collapse:collapse}.order-document th,.order-document td{text-align:left;padding:12px;border-bottom:1px solid #777}.order-document p{overflow-wrap:anywhere}@media print{body{background:white!important;color:black!important}body>*:not(main){background:white}.order-document{border:0;color:black!important;background:white!important}.order-document button,header,footer,nav{display:none!important}.order-document a{color:black} }`}</style><PrintOrderButton/><h1>AURUM · สรุปคำสั่งซื้อ</h1><p>เอกสารสำหรับตรวจสอบรายการ ไม่ใช่ใบกำกับภาษี</p>{(getSimulation(order.quote)||getPromptPay(order.quote)?.environment==="sandbox")&&<h2>รายการจำลอง / Sandbox · ไม่มีการรับเงินจริง</h2>}<p>เลขที่ {order.id}</p><p>สั่งเมื่อ {date(order.createdAt)} · {statusLabels[order.status]||order.status}</p><h2>ข้อมูลลูกค้า</h2><p>{customer.name} · {customer.email||"ไม่ระบุอีเมล"} · {customer.contact}</p><h2>เว็บไซต์และตำแหน่ง</h2><p>{quote.website?.name} {quote.website?.url}</p><ul>{order.slots.map(s=><li key={s}>{slotLabel(s)}</li>)}</ul><table><thead><tr><th>รายการ</th><th>จำนวน</th><th>ราคาต่อหน่วย</th><th>รวม (บาท)</th></tr></thead><tbody>{(quote.lines||[{label:"ยอดตามคำสั่งซื้อเดิม",quantity:1,unitPrice:order.amount,amount:order.amount}]).map((l,i)=><tr key={i}><td>{l.label}</td><td>{l.quantity}</td><td>{l.unitPrice.toLocaleString()}</td><td>{l.amount.toLocaleString()}</td></tr>)}</tbody><tfoot><tr><th colSpan={3}>รวมค่าบริการ</th><td>{order.amount.toLocaleString()} บาท</td></tr></tfoot></table><p>ระยะเวลา {order.days} วัน · เริ่ม {date(order.startsAt)} · สิ้นสุด {date(order.endsAt)}</p><p>เลขอ้างอิงชำระเงิน: {order.paymentReference||"ยังไม่ยืนยันยอด"}</p>{order.refundReference&&<p>คืนเงิน {order.refundAmount?.toLocaleString()} บาท · อ้างอิง {order.refundReference} · {date(order.refundedAt)}</p>}<p>เงื่อนไขที่ยอมรับ: {quote.terms?`${quote.terms.version} · ${new Date(quote.terms.acceptedAt).toLocaleString("th-TH",{timeZone:"Asia/Bangkok"})}`:"รายการเดิมไม่มีข้อมูลรุ่นเงื่อนไข"}</p><p>ติดต่อทีมงาน Telegram: @thaitubevideo</p></main>;
}
