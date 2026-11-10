"use client";

import { useState } from "react";
import { Alert, Box, Button, Card, CardContent, Chip, InputAdornment, Stack, TextField, Typography } from "@mui/material";
import { SitePreview } from "@/components/admin/SitePreview";

type Website = { name: string; url: string; active: boolean };

export function WebsiteGallery({ sites, unavailable = false }: { sites: Website[]; unavailable?: boolean }) {
  const [query, setQuery] = useState("");
  const term = query.trim().toLocaleLowerCase();
  const visible = sites.filter(site => `${site.name} ${site.url}`.toLocaleLowerCase().includes(term));
  return <Box component="main" sx={{ py: { xs: 3, md: 6 } }}>
    <Box sx={{ mb: 4, p: { xs: 3, md: 5 }, border: "1px solid", borderColor: "divider", borderRadius: 4, background: "linear-gradient(120deg,rgba(230,192,110,.12),transparent)" }}>
      <Typography variant="overline" color="primary">AURUM · WEBSITE SHOWCASE</Typography>
      <Typography component="h1" variant="h3" sx={{ mt: 1, mb: 2, fontWeight: 800 }}>เว็บไซต์ตัวอย่าง</Typography>
      <Typography color="text.secondary" sx={{ maxWidth: 720 }}>สำรวจเว็บไซต์ที่เชื่อมต่อกับ AURUM ดูรูปแบบการนำเสนอและคลิกเข้าชมเว็บไซต์จริง เพื่อค้นหาแนวทางที่เหมาะกับเว็บไซต์ของคุณ</Typography>
      <Stack direction="row" spacing={1} sx={{ mt: 3, flexWrap: "wrap", gap: 1 }}><Chip label={`${sites.length} เว็บไซต์ในเครือข่าย`} variant="outlined" color="primary" /><Chip label="เปิดเว็บไซต์ในแท็บใหม่" variant="outlined" /></Stack>
    </Box>
    <Stack direction={{ xs: "column", sm: "row" }} spacing={2} sx={{ mb: 3, justifyContent: "space-between", alignItems: { sm: "center" } }}>
      <Box><Typography variant="h5" component="h2">เว็บไซต์ทั้งหมด</Typography><Typography variant="body2" color="text.secondary">แสดง {visible.length} จาก {sites.length} เว็บไซต์</Typography></Box>
      <TextField label="ค้นหาเว็บไซต์" placeholder="ชื่อเว็บไซต์ หรือโดเมน" value={query} onChange={event => setQuery(event.target.value)} size="small" sx={{ width: { xs: "100%", sm: 340 } }} slotProps={{ input: { startAdornment: <InputAdornment position="start">⌕</InputAdornment> } }} />
    </Stack>
    {unavailable ? <Alert severity="warning">ยังโหลดรายการเว็บไซต์ไม่ได้ กรุณาลองใหม่อีกครั้งภายหลัง</Alert> : visible.length ? <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", sm: "repeat(2,1fr)", lg: "repeat(3,1fr)", xl: "repeat(4,1fr)" }, gap: 2.5 }}>
      {visible.map(site => <Card key={site.url} variant="outlined" sx={{ overflow: "hidden", borderRadius: 3, transition: "border-color .2s, transform .2s", "&:hover": { borderColor: "primary.main", transform: "translateY(-3px)" } }}>
        <Box sx={{ p: 1, pb: 0 }}>
          <Box sx={{ overflow: "hidden", borderRadius: 2, border: "1px solid", borderColor: "divider" }}>
            <Stack direction="row" spacing={1} sx={{ px: 1.5, py: .8, bgcolor: "action.hover", alignItems: "center" }}><Typography aria-hidden="true" sx={{ fontSize: 10, color: "text.disabled" }}>● ● ●</Typography><Typography variant="caption" noWrap>{new URL(site.url).hostname}</Typography></Stack>
            <Box sx={{ position: "relative", aspectRatio: "16/10", bgcolor: "background.default", "& > div": { inset: 0 } }}><SitePreview baseUrl={site.url} name={site.name} /></Box>
          </Box>
        </Box>
        <CardContent><Typography component="h3" variant="h6" sx={{ fontWeight: 700, overflowWrap: "anywhere" }}>{site.name}</Typography><Typography variant="body2" color="text.secondary" sx={{ mb: 2, overflowWrap: "anywhere" }}>{new URL(site.url).hostname}</Typography><Chip size="small" variant="outlined" label={site.active ? "เปิดใช้งานใน AURUM" : "พักการเชื่อมต่อ AURUM"} color={site.active ? "success" : "default"} sx={{ mb: 2 }} /><Button fullWidth variant="outlined" href={site.url} target="_blank" rel="noopener noreferrer" aria-label={`เข้าชมเว็บไซต์ ${site.name} (แท็บใหม่)`}>เข้าชมเว็บไซต์ ↗</Button></CardContent>
      </Card>)}
    </Box> : <Box sx={{ py: 8, textAlign: "center", border: "1px dashed", borderColor: "divider", borderRadius: 3 }}><Typography variant="h6">{query ? "ไม่พบเว็บไซต์ที่ค้นหา" : "ยังไม่มีเว็บไซต์ตัวอย่าง"}</Typography>{query && <Button onClick={() => setQuery("")}>แสดงเว็บไซต์ทั้งหมด</Button>}</Box>}
    <Typography variant="caption" color="text.secondary" sx={{ display: "block", mt: 3 }}>ภาพตัวอย่างอาจอัปเดตช้ากว่าเว็บไซต์จริง · สถานะการเชื่อมต่อ AURUM ไม่ใช่ผลตรวจว่าเว็บไซต์ออนไลน์อยู่ · เว็บไซต์ปลายทางบางแห่งอาจมีเนื้อหาสำหรับผู้ใหญ่</Typography>
  </Box>;
}
