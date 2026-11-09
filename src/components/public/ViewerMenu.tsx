"use client";
import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Alert, Avatar, Button, Menu, MenuItem } from "@mui/material";
import { apiFetch } from "@/lib/api-client";
import type { ViewerActor } from "@/lib/viewer-auth";
export function ViewerMenu({viewer}:{viewer:ViewerActor|null}) {
 const router=useRouter(); const[anchor,setAnchor]=useState<HTMLElement|null>(null);const[error,setError]=useState(false);
 async function logout(){try{await apiFetch("/api/public/auth/logout",{method:"POST"});setAnchor(null);router.refresh();}catch{setError(true);}}
 if(!viewer)return <Button component={Link} href="/login" variant="outlined" size="small">เข้าสู่ระบบ</Button>;
 return <><Button aria-label="บัญชีของฉัน" aria-controls={anchor?"viewer-menu":undefined} aria-haspopup="true" aria-expanded={!!anchor} onClick={e=>{setAnchor(e.currentTarget);setError(false);}} sx={{gap:1,minWidth:0,p:1}}><Avatar sx={{width:30,height:30,fontSize:14,bgcolor:"primary.main",color:"primary.contrastText"}}>{viewer.displayName.slice(0,1)}</Avatar><span className="member-menu-name">{viewer.displayName}</span></Button><Menu id="viewer-menu" anchorEl={anchor} open={!!anchor} onClose={()=>setAnchor(null)}>{[["/account","บัญชีและคำสั่งซื้อ"],["/services/select","สั่งซื้อบริการ"],["/account/payments","การชำระเงิน"],["/library","ดูภายหลัง"],["/liked","วิดีโอที่ถูกใจ"]].map(([href,label])=><MenuItem component={Link} key={href} href={href!} onClick={()=>setAnchor(null)}>{label}</MenuItem>)}<MenuItem onClick={logout}>ออกจากระบบ</MenuItem>{error&&<Alert severity="error">ออกจากระบบไม่สำเร็จ กรุณาลองอีกครั้ง</Alert>}</Menu></>;
}
