"use client";
import { useState } from "react";
import { Box, Card, CardContent, Chip, Typography } from "@mui/material";
function Preview({ image, name }: { image: string; name: string }) {
  const [failed, setFailed] = useState(false);
  return <Box sx={{ aspectRatio: "16 / 10", bgcolor: "#24272d", overflow: "hidden", display: "grid", placeItems: "center" }}>{failed ? <Typography color="text.secondary">ยังไม่มีภาพตัวอย่าง</Typography> : <img src={image} alt={`ภาพหน้าเว็บไซต์ ${name}`} loading="lazy" referrerPolicy="no-referrer" onError={() => setFailed(true)} style={{ width: "100%", height: "100%", objectFit: "cover", objectPosition: "top" }}/>}</Box>;
}
export function SiteShowcase({ sites }: { sites: { name: string; url: string; image: string }[] }) {
  return <Box component="section" sx={{ py: 5 }}><Typography variant="overline" color="primary">OUR NETWORK</Typography><Typography variant="h2" sx={{ mb: 1 }}>ตัวอย่างเว็บไซต์ในเครือข่าย</Typography><Typography color="text.secondary" sx={{ mb: 3 }}>เว็บไซต์ที่ลงทะเบียนและเปิดใช้งานใน AURUM · ภาพตัวอย่างอาจอัปเดตช้ากว่าหน้าเว็บจริง</Typography>{sites.length ? <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", sm: "1fr 1fr", xl: "repeat(3,1fr)" }, gap: 2.5 }}>{sites.map(site => <Card key={site.url}><Preview image={site.image} name={site.name}/><CardContent><Chip size="small" label="เว็บไซต์ในเครือข่าย" variant="outlined" sx={{ mb: 1.5 }}/><Typography variant="h3" sx={{ overflowWrap: "anywhere" }}>{site.name}</Typography><Typography component="a" href={site.url} target="_blank" rel="noopener noreferrer" color="primary" variant="body2" sx={{ display: "block", mt: 1, overflowWrap: "anywhere" }}>{new URL(site.url).hostname} ↗</Typography></CardContent></Card>)}</Box> : <Card sx={{ p: 3 }}><Typography color="text.secondary">ยังไม่มีภาพเว็บไซต์ที่พร้อมแสดง กรุณาติดต่อทีมงานเพื่อดูตัวอย่างงาน</Typography></Card>}</Box>;
}
