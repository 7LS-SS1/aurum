"use client";
import { useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { Box, Stack, Paper, Typography, Button, Chip, Tabs, Tab, Alert, Dialog, DialogTitle, DialogContent, DialogActions, Checkbox, FormControlLabel, TextField, MenuItem, Divider } from "@mui/material";
import { apiFetch } from "@/lib/api-client";
import { can, type Role } from "@/lib/permissions";
import { canDistributeMovie } from "@/lib/distribution-policy";
import { describeDistributionOutcome, type DistributionOutcomeSummary } from "@/lib/distribution-outcome";
type Site = { id: string; name: string; baseUrl: string };
type Distribution = { siteId: string; name: string; status: string; error: string | null; url: string | null; attempts: number };
export function VideoWorkspace({ movie, role, sites, distributions, player, editor }: {
  movie: { id: string; title: string; status: string; mainCategory: string | null; views: number; description: string; tags: string[]; updatedAt: string };
  role: Role; sites: Site[]; distributions: Distribution[]; player: ReactNode; editor: ReactNode;
}) {
  const router = useRouter();
  const [tab, setTab] = useState(0), [open, setOpen] = useState(false), [busy, setBusy] = useState(false), [message, setMessage] = useState("");
  const [selected, setSelected] = useState<string[]>([]), [search, setSearch] = useState(""), [mode, setMode] = useState("video_only");
  const [results, setResults] = useState<{ siteId: string; status: string; error?: string }[]>([]);
  async function resend() {
    setBusy(true); setMessage(""); setResults([]);
    try {
      const result = await apiFetch<DistributionOutcomeSummary & { results: { siteId: string; status: string; error?: string }[] }>(`/api/movies/${movie.id}/distribute`, { method: "POST", body: JSON.stringify({ siteIds: selected, mode }) });
      setMessage(describeDistributionOutcome(result, "ส่งข้อมูลแล้ว").message); setResults(result.results); setOpen(false); setTab(2); router.refresh();
    } catch (e) { setMessage(e instanceof Error ? e.message : "ส่งไม่สำเร็จ"); }
    finally { setBusy(false); }
  }
  return <Stack spacing={3} sx={{ maxWidth: 1400, mx: "auto", pb: 5 }}>
    <Box><Button href="/admin/videos">← วิดีโอทั้งหมด</Button><Typography variant="overline" sx={{ display: "block" }}>VIDEO WORKSPACE</Typography><Typography variant="h4" sx={{ fontWeight: 700 }}>{movie.title}</Typography></Box>
    <Stack direction="row" spacing={1} useFlexGap sx={{ flexWrap: "wrap" }}><Chip label={movie.status} /><Chip label={movie.mainCategory || "ยังไม่ระบุประเภท"} /><Chip label={`${movie.views.toLocaleString("th-TH")} ครั้งที่รับชม`} /><Chip label={`อัปเดต ${new Date(movie.updatedAt).toLocaleString("th-TH")}`} /></Stack>
    <Stack direction="row" spacing={1} useFlexGap sx={{ flexWrap: "wrap" }}><Button variant="contained" onClick={() => setTab(1)}>แก้ไขข้อมูล</Button><Button href={`/admin/videos/${movie.id}/preview`}>ตรวจสอบก่อนเผยแพร่</Button><Button variant="outlined" disabled={busy || !sites.length || !can(role, "movie:publish") || !canDistributeMovie(movie.status, role)} onClick={() => { setSelected(sites.map(s => s.id)); setMessage(""); setOpen(true); }}>ส่งใหม่ไปยังเว็บไซต์</Button></Stack>
    {message && <Alert severity="info">{message}</Alert>}
    <Paper variant="outlined" sx={{ borderRadius: 3, overflow: "hidden" }}><Tabs value={tab} onChange={(_, value) => setTab(value)} variant="scrollable" allowScrollButtonsMobile><Tab label="ภาพรวมและตัวเล่น" /><Tab label="แก้ไขข้อมูลและไฟล์" /><Tab label={`เว็บไซต์ปลายทาง (${distributions.length})`} /></Tabs><Divider />
      <Box sx={{ p: { xs: 2, md: 3 } }}>
        {tab === 0 && <Stack spacing={3}>{player}<Typography variant="h6">รายละเอียดวิดีโอ</Typography><Typography sx={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>{movie.description || "ยังไม่มีคำอธิบาย"}</Typography><Stack direction="row" spacing={1} useFlexGap sx={{ flexWrap: "wrap" }}>{movie.tags.map(t => <Chip key={t} label={t} size="small" />)}</Stack><Typography variant="caption">Video ID: {movie.id}</Typography></Stack>}
        <Box hidden={tab !== 1}>{editor}</Box>
        {tab === 2 && <Stack spacing={2}>
          <Alert severity="info">ส่งซ้ำผ่านระบบเดิมเพื่ออัปเดตโพสต์ที่เชื่อมอยู่ หากยังไม่เคยส่งไปยังเว็บไซต์ที่เลือก ระบบจะสร้างโพสต์ใหม่</Alert>
          {results.map(r => <Alert key={r.siteId} severity={r.status === "success" ? "success" : "warning"}>{sites.find(s => s.id === r.siteId)?.name || r.siteId}: {r.status} {r.error}</Alert>)}
          {!distributions.length && <Typography>ยังไม่มีประวัติการส่งไปยังเว็บไซต์</Typography>}
          {distributions.map(d => <Paper variant="outlined" key={d.siteId} sx={{ p: 2 }}><Stack spacing={1}><Typography sx={{ fontWeight: 700 }}>{d.name}</Typography><Typography>{d.status} · ส่งแล้ว {d.attempts} ครั้ง</Typography>{d.error && <Alert severity="error">{d.error}</Alert>}{d.url && /^https?:\/\//i.test(d.url) && <Button href={d.url} target="_blank" rel="noopener noreferrer">เปิดโพสต์ปลายทาง ↗</Button>}</Stack></Paper>)}
        </Stack>}
      </Box>
    </Paper>
    <Dialog open={open} onClose={() => !busy && setOpen(false)} fullWidth maxWidth="sm"><DialogTitle>ส่งวิดีโอใหม่ไปยังเว็บไซต์</DialogTitle><DialogContent><Stack spacing={2} sx={{ pt: 1 }}>
      {message && <Alert severity="error">{message}</Alert>}
      <TextField select disabled={busy} label="ข้อมูลที่จะส่ง" value={mode} onChange={e => setMode(e.target.value)}><MenuItem value="video_only">อัปเดตวิดีโอ หมวดหมู่ และแท็ก</MenuItem><MenuItem value="overwrite_editorial">เขียนทับข้อมูลบทความด้วย</MenuItem></TextField>
      <Alert severity={mode === "overwrite_editorial" ? "warning" : "info"}>{mode === "overwrite_editorial" ? "ชื่อเรื่อง slug เนื้อหา หมวดหมู่ และแท็กที่ปลายทางจะถูกแทนที่" : "รักษาชื่อเรื่อง เนื้อหา slug รูปปก และ SEO ที่ปลายทาง"}</Alert>
      <FormControlLabel label={`ทุกเว็บไซต์ที่เปิดใช้งาน (${sites.length})`} control={<Checkbox disabled={busy} checked={!!sites.length && selected.length === sites.length} indeterminate={selected.length > 0 && selected.length < sites.length} onChange={e => setSelected(e.target.checked ? sites.map(s => s.id) : [])} />} />
      <TextField label="ค้นหาเว็บไซต์" value={search} onChange={e => setSearch(e.target.value)} />
      <Box sx={{ maxHeight: 280, overflowY: "auto" }}>{sites.filter(s => `${s.name} ${s.baseUrl}`.toLowerCase().includes(search.toLowerCase())).map(s => <FormControlLabel sx={{ display: "flex" }} key={s.id} label={`${s.name} · ${s.baseUrl}`} control={<Checkbox disabled={busy} checked={selected.includes(s.id)} onChange={e => setSelected(old => e.target.checked ? [...old, s.id] : old.filter(id => id !== s.id))} />} />)}</Box>
    </Stack></DialogContent><DialogActions><Button disabled={busy} onClick={() => setOpen(false)}>ยกเลิก</Button><Button variant="contained" disabled={busy || !selected.length} onClick={resend}>{busy ? "กำลังส่ง…" : `ยืนยันส่ง ${selected.length} เว็บไซต์`}</Button></DialogActions></Dialog>
  </Stack>;
}
