"use client";
import { useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { Box, Stack, Paper, Typography, Button, Chip, Tabs, Tab, Alert, Dialog, DialogTitle, DialogContent, DialogActions, Checkbox, FormControlLabel, TextField, MenuItem, Divider, Table, TableHead, TableBody, TableRow, TableCell, TableContainer } from "@mui/material";
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
  const successful = distributions.filter(d => d.status === "SUCCESS").length;
  const statuses: Record<string, string> = { DRAFT: "ฉบับร่าง", DONE: "เผยแพร่สำเร็จ", PARTIAL: "สำเร็จบางส่วน", FAILED: "เผยแพร่ล้มเหลว", APPROVED: "พร้อมเผยแพร่", PUBLISHING: "กำลังเผยแพร่", REJECTED: "ต้องแก้ไข", ARCHIVED: "เก็บถาวร" };
  return <Stack spacing={3} sx={{ maxWidth: 1400, mx: "auto", pb: 5 }}>
    <Button href="/admin/videos" sx={{ alignSelf: "flex-start" }}>← กลับคลังวิดีโอ</Button>
    <Paper variant="outlined" sx={{ p: { xs: 3, md: 4 }, background: "linear-gradient(120deg, rgba(229,196,119,.10), transparent 65%)" }}><Stack spacing={2.5}>
      <Stack direction="row" spacing={1}><Chip size="small" label="VIDEO WORKSPACE" variant="outlined" /><Chip size="small" color={movie.status === "DONE" ? "success" : "default"} label={statuses[movie.status] || movie.status} /></Stack>
      <Typography variant="h4" sx={{ fontWeight: 750, lineHeight: 1.5, maxWidth: 1000, overflowWrap: "anywhere" }}>{movie.title}</Typography>
      <Typography color="text.secondary">{movie.mainCategory || "ยังไม่ระบุประเภท"} · อัปเดต {new Date(movie.updatedAt).toLocaleString("th-TH")}</Typography>
      <Stack direction="row" spacing={1} useFlexGap sx={{ flexWrap: "wrap" }}><Button variant="contained" disabled={!can(role, "movie:edit")} onClick={() => setTab(1)}>แก้ไขข้อมูลวิดีโอ</Button><Button variant="outlined" href={`/admin/videos/${movie.id}/preview`}>เปิดหน้าตัวอย่าง ↗</Button><Button disabled={busy || !sites.length || !can(role, "movie:publish") || !canDistributeMovie(movie.status, role)} onClick={() => { setSelected(sites.map(s => s.id)); setMessage(""); setOpen(true); }}>ส่งใหม่ไปยังเว็บไซต์</Button></Stack>
    </Stack></Paper>
    <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr 1fr", md: "repeat(4, 1fr)" }, gap: 2 }}>{[["ยอดรับชมรวม", movie.views.toLocaleString("th-TH")], ["เว็บไซต์ที่ส่งแล้ว", distributions.length], ["ปลายทางสำเร็จ", successful], ["แท็กในวิดีโอ", movie.tags.length]].map(([label,value]) => <Paper variant="outlined" key={label} sx={{ p: 2.5 }}><Typography variant="body2" color="text.secondary">{label}</Typography><Typography variant="h4" sx={{ fontWeight: 700, mt: 1 }}>{value}</Typography></Paper>)}</Box>
    {message && <Alert severity="info">{message}</Alert>}
    <Paper variant="outlined" sx={{ borderRadius: 3, overflow: "hidden" }}><Tabs value={tab} onChange={(_, value) => setTab(value)} variant="scrollable" allowScrollButtonsMobile><Tab label="ภาพรวมและตัวเล่น" /><Tab label="แก้ไขข้อมูลและไฟล์" disabled={!can(role, "movie:edit")} /><Tab label={`เว็บไซต์ปลายทาง (${distributions.length})`} /></Tabs><Divider />
      <Box sx={{ p: { xs: 2, md: 3 } }}>
        {tab === 0 && <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", lg: "minmax(0, 1.8fr) minmax(260px, 1fr)" }, gap: 3 }}><Stack spacing={3}><Box sx={{ bgcolor: "#000", borderRadius: 2, overflow: "hidden", "& video": { width: "100%" } }}>{player}</Box><Box><Typography variant="h6" sx={{ mb: 1 }}>รายละเอียดเนื้อหา</Typography><Typography color="text.secondary" sx={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>{movie.description || "ยังไม่มีคำอธิบาย เพิ่มรายละเอียดในแท็บแก้ไขข้อมูล"}</Typography></Box></Stack><Stack spacing={2}><Paper variant="outlined" sx={{ p: 2.5 }}><Typography variant="h6" sx={{ mb: 2 }}>ข้อมูลวิดีโอ</Typography><Typography variant="caption" color="text.secondary">ประเภท</Typography><Typography sx={{ mb: 2 }}>{movie.mainCategory || "ยังไม่ระบุ"}</Typography><Typography variant="caption" color="text.secondary">รหัสวิดีโอ</Typography><Typography variant="body2" sx={{ overflowWrap: "anywhere", mb: 2 }}>{movie.id}</Typography><Divider sx={{ mb: 2 }} /><Typography variant="subtitle2" sx={{ mb: 1 }}>แท็ก</Typography><Stack direction="row" spacing={1} useFlexGap sx={{ flexWrap: "wrap" }}>{movie.tags.map(t => <Chip key={t} label={t} size="small" variant="outlined" />)}{!movie.tags.length && <Typography color="text.secondary" variant="body2">ยังไม่มีแท็ก</Typography>}</Stack></Paper><Alert severity="info">จัดการข้อมูลต้นฉบับได้ในแท็บแก้ไข และติดตามผลการส่งได้ในแท็บเว็บไซต์ปลายทาง</Alert></Stack></Box>}
        <Box hidden={tab !== 1}>{editor}</Box>
        {tab === 2 && <Stack spacing={2}>
          <Alert severity="info">ส่งซ้ำผ่านระบบเดิมเพื่ออัปเดตโพสต์ที่เชื่อมอยู่ หากยังไม่เคยส่งไปยังเว็บไซต์ที่เลือก ระบบจะสร้างโพสต์ใหม่</Alert>
          {results.map(r => <Alert key={r.siteId} severity={r.status === "success" ? "success" : "warning"}>{sites.find(s => s.id === r.siteId)?.name || r.siteId}: {r.status} {r.error}</Alert>)}
          {!distributions.length && <Typography>ยังไม่มีประวัติการส่งไปยังเว็บไซต์</Typography>}
          {!!distributions.length && <TableContainer><Table size="small"><TableHead><TableRow><TableCell>เว็บไซต์</TableCell><TableCell>สถานะการเผยแพร่</TableCell><TableCell align="center">จำนวนครั้ง</TableCell><TableCell align="right">โพสต์ปลายทาง</TableCell></TableRow></TableHead><TableBody>{distributions.map(d => <TableRow key={d.siteId} hover><TableCell sx={{ fontWeight: 600 }}>{d.name}</TableCell><TableCell><Chip size="small" label={d.status} color={d.status === "SUCCESS" ? "success" : d.status === "FAILED" ? "error" : "default"} />{d.error && <Typography variant="caption" color="error" sx={{ display: "block", maxWidth: 400, whiteSpace: "normal" }}>{d.error}</Typography>}</TableCell><TableCell align="center">{d.attempts}</TableCell><TableCell align="right">{d.url && /^https?:\/\//i.test(d.url) ? <Button size="small" href={d.url} target="_blank" rel="noopener noreferrer">เปิดโพสต์ ↗</Button> : "—"}</TableCell></TableRow>)}</TableBody></Table></TableContainer>}

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
