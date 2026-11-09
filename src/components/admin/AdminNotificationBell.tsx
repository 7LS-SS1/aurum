"use client";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { Box, Button, Chip, CircularProgress, Divider, IconButton, Popover, Typography } from "@mui/material";

type Notice = { id: string; orderId: string; title: string; message: string; readAt: string | null; createdAt: string; order: { customer: { name: string } } };
export function AdminNotificationBell() {
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  const [count, setCount] = useState<number | null>(null), [failed, setFailed] = useState(false);
  const [items, setItems] = useState<Notice[]>([]), [loading, setLoading] = useState(false);
  const [listError, setListError] = useState(false), [pending, setPending] = useState(0);
  const load = useCallback(async (signal?: AbortSignal) => {
    setLoading(true); setListError(false);
    try {
      const response = await fetch("/api/ads-notifications?status=OPEN", { cache: "no-store", signal });
      if (!response.ok) throw Error();
      const data = await response.json();
      if (!signal?.aborted) { setItems(data.items); setCount(data.unread); setPending(data.open); setFailed(false); }
    } catch { if (!signal?.aborted) setListError(true); }
    finally { if (!signal?.aborted) setLoading(false); }
  }, []);
  useEffect(() => {
    const controller = new AbortController();
    const refresh = async () => {
      if (document.visibilityState !== "visible") return;
      try {
        const response = await fetch("/api/ads-notifications?summary=true", { cache: "no-store", signal: controller.signal });
        if (!response.ok) throw Error();
        const data = await response.json();
        if (!controller.signal.aborted) { setCount(data.unread); setPending(data.open); setFailed(false); }
      } catch { if (!controller.signal.aborted) setFailed(true); }
    };
    void refresh(); const timer = setInterval(refresh, 60000);
    window.addEventListener("focus", refresh); window.addEventListener("ads-notifications-updated", refresh);
    return () => { controller.abort(); clearInterval(timer); window.removeEventListener("focus", refresh); window.removeEventListener("ads-notifications-updated", refresh); };
  }, []);
  useEffect(() => {
    if (!anchor) return;
    const controller = new AbortController();
    const refresh = () => { if (document.visibilityState === "visible") void load(controller.signal); };
    refresh(); const timer = setInterval(refresh, 60000);
    window.addEventListener("ads-notifications-updated", refresh);
    return () => { controller.abort(); clearInterval(timer); window.removeEventListener("ads-notifications-updated", refresh); };
  }, [anchor, load]);
  return <>
    <Button onClick={event => setAnchor(anchor ? null : event.currentTarget)} aria-haspopup="dialog" aria-expanded={Boolean(anchor)} aria-controls={anchor ? "admin-notification-dialog" : undefined} aria-label={`แจ้งเตือน${count === null ? "" : ` ยังไม่อ่าน ${count} รายการ`}`} sx={{whiteSpace:"nowrap",gap:1}}>
      แจ้งเตือน <Chip size="small" color="primary" label={failed ? "!" : count === null ? "…" : count > 99 ? "99+" : count}/>
    </Button>
    <Popover open={Boolean(anchor)} anchorEl={anchor} onClose={() => setAnchor(null)} anchorOrigin={{vertical:"bottom",horizontal:"right"}} transformOrigin={{vertical:"top",horizontal:"right"}} slotProps={{paper:{sx:{mt:1,width:420,maxWidth:"calc(100vw - 24px)",maxHeight:"min(640px, calc(100dvh - 100px))",display:"flex",flexDirection:"column",border:1,borderColor:"divider",borderRadius:3}}}}>
      <Box id="admin-notification-dialog" role="dialog" aria-modal="true" aria-labelledby="notification-title" sx={{display:"flex",flexDirection:"column",minHeight:0,overflow:"hidden"}}>
        <Box sx={{p:2,display:"flex",alignItems:"center",gap:1,flexShrink:0}}><Box sx={{flex:1}}><Typography id="notification-title" variant="h6">การแจ้งเตือน</Typography><Typography variant="caption" color="text.secondary">รายการที่รอทีมงานตรวจสอบ · {pending} รายการ</Typography></Box><IconButton aria-label="ปิดแจ้งเตือน" onClick={() => setAnchor(null)}>×</IconButton></Box>
        <Divider/>
        <Box sx={{overflowY:"auto",minHeight:0,p:1}} aria-busy={loading}>
          {loading && <Box role="status" sx={{p:2,textAlign:"center"}}><CircularProgress size={20}/><Typography variant="caption" sx={{display:"block"}}>กำลังอัปเดตแจ้งเตือน…</Typography></Box>}
          {listError ? <Box role="alert" sx={{p:2}}>โหลดแจ้งเตือนไม่สำเร็จ <Button onClick={() => void load()}>ลองอีกครั้ง</Button></Box> : !loading && !items.length ? <Box sx={{p:4,textAlign:"center"}}><Typography>ไม่มีรายการรอดำเนินการ</Typography><Typography variant="caption" color="text.secondary">คำสั่งซื้อและแจ้งเตือนใหม่จะแสดงที่นี่</Typography></Box> : items.map(item => <Box key={item.id} component={Link} href={`/admin/ads-orders/${item.orderId}`} onClick={() => setAnchor(null)} sx={{display:"block",p:2,mb:.5,borderRadius:2,textDecoration:"none",color:"text.primary",bgcolor:!item.readAt?"action.selected":"transparent","&:hover":{bgcolor:"action.hover"},"&:focus-visible":{outline:"2px solid",outlineColor:"primary.main"}}}>
            <Box sx={{display:"flex",gap:1,alignItems:"center"}}><Typography sx={{fontWeight:700,flex:1}}>{item.title}</Typography>{!item.readAt&&<Box component="span" aria-label="ยังไม่อ่าน" sx={{width:8,height:8,borderRadius:"50%",bgcolor:"primary.main",flexShrink:0}}/>}</Box>
            <Typography variant="body2" color="text.secondary" sx={{mt:.5,display:"-webkit-box",WebkitLineClamp:2,WebkitBoxOrient:"vertical",overflow:"hidden",overflowWrap:"anywhere"}}>{item.message}</Typography>
            <Typography variant="caption" color="text.secondary" sx={{display:"block",mt:1}}>{item.order.customer.name} · {new Date(item.createdAt).toLocaleString("th-TH",{timeZone:"Asia/Bangkok"})}</Typography>
            <Typography variant="caption" color="primary" sx={{display:"block",mt:.5}}>ตรวจสอบคำสั่งซื้อ →</Typography>
          </Box>)}
        </Box>
        <Box sx={{p:1.5,borderTop:1,borderColor:"divider",flexShrink:0,bgcolor:"background.paper"}}><Button fullWidth variant="contained" component={Link} href="/admin/notifications" onClick={() => setAnchor(null)}>ตรวจสอบคำสั่งซื้อที่ค้างอยู่</Button></Box>
      </Box>
    </Popover>
  </>;
}

