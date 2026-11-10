"use client";

import { useState } from "react";
import Link from "next/link";
import type { AdsPageConfig } from "@/lib/ads-page-config";
import { Box, Button, Chip, FormControlLabel, MenuItem, Paper, Stack, Switch, TextField, Typography } from "@mui/material";

export type AdsTargetSite = { id: string; name: string; baseUrl: string; isActive: boolean };
type Website = AdsPageConfig["websites"][number];

function canonical(url: string) {
  try { const value = new URL(url); return `${value.host.toLowerCase()}${value.pathname.replace(/\/+$/, "")}`; }
  catch { return url; }
}
function usable(site: AdsTargetSite) {
  try { const url = new URL(site.baseUrl); return site.isActive && url.protocol === "https:" && !url.username && !url.password; }
  catch { return false; }
}

export function AdsWebsiteSelector({ websites, targetSites, onChange }: {
  websites: Website[]; targetSites: AdsTargetSite[]; onChange: (websites: Website[]) => void;
}) {
  const [selected, setSelected] = useState("");
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("all");
  const choices = targetSites.filter(site => usable(site) && !websites.some(item => canonical(item.url) === canonical(site.baseUrl)));
  const selectedSite = choices.find(site => site.id === selected);
  function choose(id: string, targetId: string) {
    const target = choices.find(site => site.id === targetId);
    if (!target) return;
    onChange(websites.map(site => site.id === id ? { ...site, name: target.name, url: target.baseUrl } : site));
  }
  const visible = websites.filter(site => `${site.name} ${site.url}`.toLowerCase().includes(search.toLowerCase()) && (filter === "all" || site.enabled === (filter === "enabled")));
  return <section id="ads-websites">
    <Stack direction={{ xs: "column", md: "row" }} sx={{ justifyContent: "space-between", gap: 2, mb: 3 }}>
      <Box><Typography variant="h6" sx={{ fontWeight: 700 }}>เว็บไซต์สำหรับลงโฆษณา</Typography><Typography color="text.secondary" variant="body2">เลือกจากเว็บปลายทางที่ผูกกับ Aurum และกำหนดว่าเว็บไซต์ใดเปิดรับจอง</Typography></Box>
      <Button component={Link} href="/admin/sites" variant="outlined">จัดการเว็บปลายทาง ↗</Button>
    </Stack>
    <Paper variant="outlined" sx={{ p: 2, mb: 3, bgcolor: "background.default" }}>
      <Stack direction={{ xs: "column", sm: "row" }} sx={{ gap: 2 }}>
        <TextField select fullWidth size="small" label="เพิ่มเว็บไซต์จากทะเบียน" value={selectedSite ? selected : ""} onChange={e => setSelected(e.target.value)}>
          <MenuItem value="">เลือกเว็บไซต์</MenuItem>{choices.map(site => <MenuItem key={site.id} value={site.id}>{site.name} — {site.baseUrl}</MenuItem>)}
        </TextField>
        <Button type="button" variant="contained" sx={{ flexShrink: 0 }} disabled={!selectedSite || websites.length >= 100} onClick={() => {
          if (!selectedSite) return;
          onChange([...websites, { id: crypto.randomUUID(), name: selectedSite.name, url: selectedSite.baseUrl, enabled: false }]); setSelected("");
        }}>+ เพิ่มเว็บไซต์</Button>
      </Stack>
      <Typography variant="caption" color="text.secondary" sx={{ display: "block", mt: 1 }}>เฉพาะเว็บที่เปิดใช้งานและใช้ HTTPS · รายการที่เพิ่มแล้วจะไม่แสดงซ้ำ · เว็บไซต์ใหม่ยังไม่เปิดรับจอง</Typography>
    </Paper>
    <Stack direction={{ xs: "column", sm: "row" }} sx={{ gap: 2, mb: 2 }}>
      <TextField size="small" fullWidth label="ค้นหาชื่อเว็บไซต์หรือ URL" value={search} onChange={e => setSearch(e.target.value)} />
      <TextField select size="small" label="สถานะการจอง" value={filter} onChange={e => setFilter(e.target.value)} sx={{ minWidth: 190 }}>
        <MenuItem value="all">ทั้งหมด ({websites.length})</MenuItem><MenuItem value="enabled">เปิดรับจอง</MenuItem><MenuItem value="disabled">ปิดรับจอง</MenuItem>
      </TextField>
    </Stack>
    <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", lg: "repeat(2, minmax(0, 1fr))", xl: "repeat(3, minmax(0, 1fr))" }, gap: 2 }}>
      {visible.map(site => {
        const target = targetSites.find(item => canonical(item.baseUrl) === canonical(site.url));
        const placeholder = !target && /^https:\/\/example\.com\/?$/.test(site.url) && !site.enabled;
        const changed = target && (target.name !== site.name || target.baseUrl !== site.url);
        return <Paper variant="outlined" key={site.id} sx={{ p: 2.5, minWidth: 0, display: "flex", flexDirection: "column", gap: 1.5 }}>
          <Stack direction="row" sx={{ justifyContent: "space-between", alignItems: "start", gap: 1 }}><Typography sx={{ fontWeight: 700, overflowWrap: "anywhere" }}>{site.name}</Typography><Chip size="small" color={site.enabled ? "success" : "default"} label={site.enabled ? "เปิดรับจอง" : "ปิดรับจอง"} /></Stack>
          {placeholder ? <TextField select size="small" label="เลือกเว็บแทนรายการตัวอย่าง" value="" onChange={e => choose(site.id, e.target.value)}><MenuItem value="">เลือกเว็บไซต์</MenuItem>{choices.map(item => <MenuItem key={item.id} value={item.id}>{item.name}</MenuItem>)}</TextField> : <Typography variant="body2" color="text.secondary" sx={{ overflowWrap: "anywhere" }}>{site.url}</Typography>}
          {!target && !placeholder && <Typography variant="caption" color="warning.main">ยังไม่ตรงกับเว็บปลายทางในทะเบียน</Typography>}
          {target && !target.isActive && <Typography variant="caption" color="warning.main">เว็บปลายทางปิดใช้งานอยู่ โปรดตรวจสอบก่อนเปิดรับจอง</Typography>}
          {changed && <Button type="button" size="small" variant="outlined" disabled={!usable(target)} onClick={() => onChange(websites.map(item => item.id === site.id ? { ...item, name: target.name, url: target.baseUrl } : item))}>อัปเดตชื่อและ URL จากทะเบียน</Button>}
          <Box sx={{ mt: "auto", pt: 1, borderTop: "1px solid", borderColor: "divider" }}><FormControlLabel sx={{ m: 0 }} control={<Switch size="small" checked={site.enabled} disabled={placeholder} onChange={e => onChange(websites.map(item => item.id === site.id ? { ...item, enabled: e.target.checked } : item))} />} label={<Typography variant="body2">เปิดให้ลูกค้าเลือกจอง</Typography>} /></Box>
          <details><summary style={{ cursor: "pointer", fontSize: 12, color: "inherit" }}>รหัสเว็บไซต์สำหรับปลั๊กอิน</summary><Typography component="code" variant="caption" sx={{ overflowWrap: "anywhere" }}>{site.id}</Typography></details>
        </Paper>;
      })}
    </Box>
    {!visible.length && <Paper variant="outlined" sx={{ p: 4, textAlign: "center" }}><Typography color="text.secondary">{websites.length ? "ไม่พบเว็บไซต์ที่ตรงกับการค้นหา" : "ยังไม่มีเว็บไซต์ เพิ่มจากทะเบียนด้านบนเพื่อเริ่มต้น"}</Typography></Paper>}
    <Typography variant="caption" color="text.secondary" sx={{ display: "block", mt: 2 }}>แสดง {visible.length} จาก {websites.length} เว็บไซต์ · การเปลี่ยนแปลงมีผลเมื่อกดบันทึก โดยคงรหัสเว็บไซต์และประวัติการจองเดิม</Typography>
  </section>;
}
