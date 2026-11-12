"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
const links=[{href:"/catalog",label:"บริการตัวอย่าง"},{href:"/",label:"หน้าหลัก"},{href:"/services",label:"Website API"},{href:"/services/websites",label:"เว็บไซต์ตัวอย่าง"},{href:"/services/ads-banner",label:"ลงโฆษณา"},{href:"/account",label:"บัญชีและคำสั่งซื้อ"},{href:"/account/payments",label:"การชำระเงิน"}];
export function ServiceNav(){const path=usePathname();return <nav aria-label="เมนูหลัก">{links.map(link=><Link key={link.href} href={link.href} aria-current={(link.href==="/"||link.href==="/services"||link.href==="/account"?path===link.href:path.startsWith(link.href))?"page":undefined}>{link.label}</Link>)}</nav>;}
