"use client";

import { BulkVideoEdit } from "./BulkVideoEdit";
import { useState, useTransition } from "react";
import { Box, Stack, Paper, Typography, Button, Chip, TextField, MenuItem, Checkbox, FormControlLabel, Pagination, LinearProgress, Snackbar, Menu, Divider, Dialog, DialogTitle, DialogContent, DialogActions } from "@mui/material";
import { apiFetch, ApiClientError } from "@/lib/api-client";
import { can, type Role } from "@/lib/permissions";
import { DEFAULT_TAXO } from "@/lib/taxonomy";
import { describeDistributionOutcome, type DistributionOutcomeSummary } from "@/lib/distribution-outcome";

type MovieStatus =
  | "DRAFT"
  | "READY_FOR_REVIEW"
  | "IN_REVIEW"
  | "REJECTED"
  | "READY_FOR_APPROVAL"
  | "APPROVED"
  | "PUBLISHING"
  | "DONE"
  | "PARTIAL"
  | "FAILED"
  | "ARCHIVED";

interface MovieRow {
  id: string;
  title: string;
  slug: string | null;
  mainCategory: string | null;
  thumbnailUrl: string | null;
  previewUrl: string | null;
  viewCount: number;
  wpViewCount: number;
  extraMeta: unknown;
  targetSiteIds: unknown;
  status: MovieStatus;
  rejectionReason: string | null;
  createdAt: string;
  createdBy: { id: string; name: string | null; email: string } | null;
  reviewerId: string | null;
}

function asStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((v): v is string => typeof v === "string") : [];
}

interface UserRow {
  id: string;
  name: string | null;
  email: string;
}

interface PaginationState {
  page: number;
  totalPages: number;
  total: number;
  pageSize: number;
}

const STATUS_META: Record<MovieStatus, { label: string; cls: string }> = {
  DRAFT: { label: "รอเริ่มประมวลผล", cls: "neutral" },
  READY_FOR_REVIEW: { label: "กำลังประมวลผล", cls: "gold" },
  IN_REVIEW: { label: "กำลังประมวลผล", cls: "gold" },
  REJECTED: { label: "ต้องแก้ไข", cls: "bad" },
  READY_FOR_APPROVAL: { label: "กำลังประมวลผล", cls: "warn" },
  APPROVED: { label: "รอเผยแพร่อัตโนมัติ", cls: "ok" },
  PUBLISHING: { label: "กำลังเผยแพร่", cls: "warn" },
  DONE: { label: "เผยแพร่สำเร็จ", cls: "ok" },
  PARTIAL: { label: "สำเร็จบางส่วน", cls: "warn" },
  FAILED: { label: "ล้มเหลว", cls: "bad" },
  ARCHIVED: { label: "เก็บถาวร", cls: "neutral" },
};

const ALL_STATUSES = Object.keys(STATUS_META) as MovieStatus[];
const PAGE_SIZE = 20;

export function VideosManager({
  initialMovies,
  initialPagination,
  users,
  currentUserId,
  role,
}: {
  initialMovies: MovieRow[];
  initialPagination: PaginationState;
  users: UserRow[];
  currentUserId: string;
  role: Role;
}) {
  const [actionMenu, setActionMenu] = useState<{ anchor: HTMLElement; movie: MovieRow } | null>(null);
  const [confirmation, setConfirmation] = useState<{ message: string; action: () => void } | null>(null);
  const [movies, setMovies] = useState(initialMovies);
  const [pagination, setPagination] = useState(initialPagination);
  const [toast, setToast] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkBusy, setBulkBusy] = useState(false);

  const [status, setStatus] = useState("");
  const [mainCategory, setMainCategory] = useState("");
  const [createdById, setCreatedById] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [q, setQ] = useState("");

  function notify(msg: string) {
    setToast(msg);
    setTimeout(() => setToast(null), 2800);
  }

  function addFilterParams(params: URLSearchParams) {
    if (status) params.set("status", status);
    if (mainCategory) params.set("mainCategory", mainCategory);
    if (createdById) params.set("createdById", createdById);
    if (dateFrom) params.set("dateFrom", new Date(dateFrom).toISOString());
    if (dateTo) params.set("dateTo", new Date(dateTo).toISOString());
    if (q.trim()) params.set("q", q.trim());
  }

  async function fetchPage(page: number) {
    const params = new URLSearchParams();
    params.set("page", String(page));
    params.set("take", String(PAGE_SIZE));
    addFilterParams(params);
    const res = await apiFetch<{ movies: MovieRow[]; pagination: PaginationState }>(`/api/movies?${params.toString()}`);
    setMovies(res.movies);
    setPagination(res.pagination);
    setSelectedIds(new Set());
  }

  function applyFilters() {
    startTransition(async () => {
      try {
        const params = new URLSearchParams();
        params.set("page", "1");
        params.set("take", String(PAGE_SIZE));
        if (status) params.set("status", status);
        if (mainCategory) params.set("mainCategory", mainCategory);
        if (createdById) params.set("createdById", createdById);
        if (dateFrom) params.set("dateFrom", new Date(dateFrom).toISOString());
        if (dateTo) params.set("dateTo", new Date(dateTo).toISOString());
        if (q.trim()) params.set("q", q.trim());
        const res = await apiFetch<{ movies: MovieRow[]; pagination: PaginationState }>(`/api/movies?${params.toString()}`);
        setMovies(res.movies);
        setPagination(res.pagination);
        setSelectedIds(new Set());
      } catch (err) {
        notify(err instanceof ApiClientError ? err.message : "โหลดรายการไม่สำเร็จ");
      }
    });
  }

  function clearFilters() {
    setStatus("");
    setMainCategory("");
    setCreatedById("");
    setDateFrom("");
    setDateTo("");
    setQ("");
    startTransition(async () => {
      try {
      const res = await apiFetch<{ movies: MovieRow[]; pagination: PaginationState }>(`/api/movies?page=1&take=${PAGE_SIZE}`);
      setMovies(res.movies);
      setPagination(res.pagination);
      setSelectedIds(new Set());
      } catch (err) {
        notify(err instanceof ApiClientError ? err.message : "โหลดรายการไม่สำเร็จ");
      }
    });
  }

  function goToPage(page: number) {
    if (page < 1 || page > pagination.totalPages || page === pagination.page) return;
    startTransition(async () => {
      try {
        await fetchPage(page);
      } catch (err) {
        notify(err instanceof ApiClientError ? err.message : "โหลดรายการไม่สำเร็จ");
      }
    });
  }

  async function run<T>(id: string, label: string | ((result: T) => string), fn: () => Promise<T>, refetchAfter = true) {
    setBusyId(id);
    try {
      const result = await fn();
      notify(typeof label === "function" ? label(result) : label);
      if (refetchAfter) await fetchPage(pagination.page);
    } catch (err) {
      notify(err instanceof ApiClientError ? err.message : "ดำเนินการไม่สำเร็จ");
    } finally {
      setBusyId(null);
    }
  }

  function submitReview(m: MovieRow) {
    run(m.id, "เริ่มประมวลผลแล้ว", () => apiFetch(`/api/movies/${m.id}/submit-review`, { method: "POST" }));
  }

  function archive(m: MovieRow) {
    setConfirmation({ message: `เก็บถาวร “${m.title}”?`, action: () => { void run(m.id, "เก็บถาวรแล้ว", () => apiFetch(`/api/movies/${m.id}/archive`, { method: "POST" })); } });
  }

  function toggleSelected(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleSelectAllVisible() {
    setSelectedIds((prev) => (movies.filter(m => m.status !== "PUBLISHING").every(m => prev.has(m.id)) ? new Set() : new Set(movies.filter(m => m.status !== "PUBLISHING").map(movie => movie.id))));
  }

  async function deleteMovie(m: MovieRow) {
    await run(m.id, "ลบวิดีโอแล้ว", () => apiFetch(`/api/movies/${m.id}`, { method: "DELETE" }));
    setSelectedIds((prev) => {
      const next = new Set(prev);
      next.delete(m.id);
      return next;
    });
  }

  async function deleteSelected() {
    const ids = [...selectedIds];
    if (!ids.length) return;


    setBulkBusy(true);
    try {
      await apiFetch("/api/movies/bulk-delete", { method: "POST", body: JSON.stringify({ ids }) });
      notify(`ลบวิดีโอแล้ว ${ids.length} รายการ`);
      setSelectedIds(new Set());
      await fetchPage(pagination.page);
    } catch (err) {
      notify(err instanceof ApiClientError ? err.message : "ลบวิดีโอไม่สำเร็จ");
    } finally {
      setBulkBusy(false);
    }
  }

  function publishNow(m: MovieRow, mode: "video_only" | "overwrite_editorial" = "video_only") {
    const siteIds = asStringArray(m.targetSiteIds);
    if (!siteIds.length) return notify("ยังไม่มีเว็บปลายทางที่เปิดใช้งาน — เพิ่มเว็บที่หน้า \"เว็บปลายทาง\" ก่อน");
    const warning = mode === "overwrite_editorial"
      ? `เขียนทับ Title, slug, content, excerpt, หมวดหมู่ และแท็กของ "${m.title}" บน WordPress (${siteIds.length} เว็บ) — การแก้ไขของผู้ดูแลปลายทางจะถูกแทนที่ ยืนยัน?`
      : `อัปเดตข้อมูลวิดีโอ หมวดหมู่ และแท็กของ "${m.title}" (${siteIds.length} เว็บ) โดยรักษาชื่อ เนื้อหา slug รูปปก และ SEO ใน WordPress — ยืนยัน?`;
    setConfirmation({ message: warning, action: () => executePublish(m, siteIds, mode) });
  }

  function executePublish(m: MovieRow, siteIds: string[], mode: "video_only" | "overwrite_editorial") {
    const successMessage = mode === "overwrite_editorial" ? "เขียนทับข้อมูล WordPress แล้ว" : "อัปเดตวิดีโอ หมวดหมู่ และแท็กแล้ว";
    run(m.id, (message: string) => message, async () => {
      const result = await apiFetch<DistributionOutcomeSummary>(`/api/movies/${m.id}/distribute`, {
        method: "POST",
        body: JSON.stringify({ siteIds, mode }),
      });
      const outcome = describeDistributionOutcome(result, successMessage);
      if (!outcome.ok) throw new ApiClientError(outcome.message, 409);
      return outcome.message;
    });
  }

  async function retry(m: MovieRow) {
    setBusyId(m.id);
    try {
      const distributions = await apiFetch<Array<{ siteId: string; status: string }>>(`/api/movies/${m.id}/status`);
      const failedIds = distributions.filter((d) => d.status === "FAILED").map((d) => d.siteId);
      if (!failedIds.length) {
        notify("ไม่มีเว็บที่ล้มเหลว");
        return;
      }
      const result = await apiFetch<DistributionOutcomeSummary>(`/api/movies/${m.id}/distribute`, {
        method: "POST",
        body: JSON.stringify({ siteIds: failedIds, mode: "video_only" }),
      });
      const outcome = describeDistributionOutcome(result, "ลองเผยแพร่ใหม่แล้ว");
      notify(outcome.message);
      await fetchPage(pagination.page);
    } catch (err) {
      notify(err instanceof ApiClientError ? err.message : "ลองใหม่ไม่สำเร็จ");
    } finally {
      setBusyId(null);
    }
  }

  function canEdit(): boolean {
    return can(role, "movie:edit");
  }

  const canDeleteMovies = can(role, "movie:delete");
  const canSelect = canDeleteMovies || canEdit();
  const allVisibleSelected = movies.some(m => m.status !== "PUBLISHING") && movies.filter(m => m.status !== "PUBLISHING").every(m => selectedIds.has(m.id));
  const menuMovie = actionMenu?.movie;
  const color = (status: MovieStatus) => status === "DONE" ? "success" : ["FAILED", "REJECTED"].includes(status) ? "error" : ["PARTIAL", "PUBLISHING"].includes(status) ? "warning" : "default";
  const action = (fn: () => void) => { setActionMenu(null); fn(); };
  return <Stack spacing={3} sx={{ pb: 5, maxWidth: 1600, mx: "auto" }}>
    <Stack direction={{ xs: "column", sm: "row" }} spacing={2} sx={{ justifyContent: "space-between" }}>
      <Box><Typography variant="overline" color="primary">CONTENT LIBRARY</Typography><Typography variant="h1">คลังวิดีโอ</Typography><Typography color="text.secondary">ค้นหา จัดหมวดหมู่ และติดตามการเผยแพร่ในพื้นที่เดียว</Typography></Box>
      {can(role, "movie:create") && <Button href="/admin/videos/new" variant="contained" sx={{ alignSelf: "center" }}>＋ เพิ่มวิดีโอ</Button>}
    </Stack>
    <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr 1fr", md: "repeat(4, 1fr)" }, gap: 2 }}>
      {[["ผลลัพธ์ทั้งหมด", pagination.total], ["รายการในหน้านี้", movies.length], ["ต้องตรวจสอบในหน้านี้", movies.filter(m => ["FAILED", "PARTIAL", "REJECTED"].includes(m.status)).length], ["เลือกแล้ว", selectedIds.size]].map(([label, value]) => <Paper variant="outlined" key={label} sx={{ p: 2.5 }}><Typography variant="body2" color="text.secondary">{label}</Typography><Typography variant="h4" sx={{ mt: 1, fontWeight: 700 }}>{Number(value).toLocaleString("th-TH")}</Typography></Paper>)}
    </Box>
    <Paper variant="outlined" sx={{ p: 2.5 }}><Stack spacing={2} component="form" onSubmit={e => { e.preventDefault(); applyFilters(); }}>
      <Stack direction={{ xs: "column", sm: "row" }} spacing={2}><TextField label="ค้นหาวิดีโอ" placeholder="ชื่อเรื่อง หรือ slug" value={q} onChange={e => setQ(e.target.value)} /><Button type="submit" variant="contained" disabled={pending}>ค้นหา</Button><Button disabled={pending} onClick={clearFilters} sx={{ whiteSpace: "nowrap" }}>ล้างตัวกรอง</Button></Stack>
      <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", sm: "1fr 1fr", lg: "repeat(5, 1fr)" }, gap: 2 }}>
        <TextField select label="สถานะ" value={status} onChange={e => setStatus(e.target.value)}><MenuItem value="">ทุกสถานะ</MenuItem>{ALL_STATUSES.map(s => <MenuItem key={s} value={s}>{STATUS_META[s].label} · {s}</MenuItem>)}</TextField>
        <TextField select label="ประเภท" value={mainCategory} onChange={e => setMainCategory(e.target.value)}><MenuItem value="">ทุกประเภท</MenuItem>{Object.keys(DEFAULT_TAXO).map(c => <MenuItem key={c} value={c}>{c}</MenuItem>)}</TextField>
        <TextField select label="ผู้สร้าง" value={createdById} onChange={e => setCreatedById(e.target.value)}><MenuItem value="">ทุกผู้สร้าง</MenuItem>{users.map(u => <MenuItem key={u.id} value={u.id}>{u.name ?? u.email}</MenuItem>)}</TextField>
        <TextField type="date" label="ตั้งแต่วันที่" slotProps={{ inputLabel: { shrink: true } }} value={dateFrom} onChange={e => setDateFrom(e.target.value)} />
        <TextField type="date" label="ถึงวันที่" slotProps={{ inputLabel: { shrink: true } }} value={dateTo} onChange={e => setDateTo(e.target.value)} />
      </Box>
    </Stack></Paper>
    <Paper variant="outlined" sx={{ overflow: "hidden" }} aria-busy={pending || bulkBusy}>
      {pending && <LinearProgress />}
      <Stack direction={{ xs: "column", md: "row" }} spacing={1} sx={{ alignItems: { md: "center" }, p: 2, bgcolor: "action.hover", borderBottom: 1, borderColor: "divider" }}>
        {canSelect && <FormControlLabel label="เลือกทั้งหน้า" control={<Checkbox checked={allVisibleSelected} indeterminate={selectedIds.size > 0 && !allVisibleSelected} disabled={pending || bulkBusy} onChange={toggleSelectAllVisible} />} />}
        <Typography variant="body2" color="text.secondary" sx={{ flex: 1 }}>{selectedIds.size ? `เลือก ${selectedIds.size} รายการ` : `แสดง ${movies.length} จาก ${pagination.total.toLocaleString("th-TH")} รายการ`}</Typography>
        {canEdit() && <BulkVideoEdit ids={[...selectedIds]} disabled={bulkBusy || pending} onSaved={async () => { await fetchPage(pagination.page); notify("บันทึกข้อมูลที่เลือกแล้ว"); }} />}
        {canDeleteMovies && <Button color="error" disabled={!selectedIds.size || bulkBusy || pending} onClick={() => setConfirmation({ message: `ลบ ${selectedIds.size} รายการ รวมประวัติการกระจายและข้อมูลร่างที่เกี่ยวข้อง? ไม่สามารถย้อนกลับได้`, action: () => { void deleteSelected(); } })}>ลบที่เลือก</Button>}
      </Stack>
      {!movies.length && <Box sx={{ py: 9, textAlign: "center" }}><Typography variant="h6">ไม่พบวิดีโอ</Typography><Typography color="text.secondary">ลองเปลี่ยนคำค้นหาหรือล้างตัวกรอง</Typography><Button onClick={clearFilters}>แสดงทั้งหมด</Button></Box>}
      {movies.map(m => { const meta = (m.extraMeta as Record<string, unknown>) ?? {}; return <Box component="article" key={m.id} sx={{ display: "grid", gridTemplateColumns: { xs: "32px 100px 1fr", md: "40px 180px minmax(0,1fr) 130px 120px" }, gap: { xs: 1, md: 2.5 }, p: { xs: 1.5, md: 2.5 }, alignItems: "center", borderBottom: 1, borderColor: "divider", bgcolor: selectedIds.has(m.id) ? "action.selected" : "transparent", "&:hover": { bgcolor: "action.hover" } }}>
        <Box>{canSelect && <Checkbox size="small" slotProps={{ input: { "aria-label": `เลือก ${m.title}` } }} checked={selectedIds.has(m.id)} disabled={m.status === "PUBLISHING" || bulkBusy || pending} onChange={() => toggleSelected(m.id)} />}</Box>
        <Box component="a" href={`/admin/videos/${m.id}`} sx={{ display: "block", position: "relative", aspectRatio: "16/9", bgcolor: "background.default", borderRadius: 2, overflow: "hidden" }}>{m.thumbnailUrl ? <Box component="img" src={m.thumbnailUrl} alt={m.title} loading="lazy" sx={{ width: "100%", height: "100%", objectFit: "cover" }} /> : <Box sx={{ display: "grid", placeItems: "center", height: "100%", color: "text.secondary" }}>ไม่มีรูปปก</Box>}{typeof meta.duration === "string" && <Chip size="small" label={meta.duration} sx={{ position: "absolute", bottom: 4, right: 4, bgcolor: "rgba(0,0,0,.8)" }} />}</Box>
        <Stack spacing={.8} sx={{ minWidth: 0 }}><Typography component="a" href={`/admin/videos/${m.id}`} sx={{ fontWeight: 650, color: "text.primary", textDecoration: "none", overflowWrap: "anywhere", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden", "&:hover": { color: "primary.main" } }}>{m.title}</Typography><Stack direction="row" spacing={1} useFlexGap sx={{ flexWrap: "wrap" }}><Chip size="small" label={m.mainCategory || "ไม่ระบุประเภท"} variant="outlined" /><Chip size="small" label={STATUS_META[m.status].label} color={color(m.status)} /></Stack><Typography variant="caption" color="text.secondary">{m.createdBy?.name ?? m.createdBy?.email ?? "ไม่ระบุผู้สร้าง"} · {new Date(m.createdAt).toLocaleDateString("th-TH")}</Typography>{m.rejectionReason && <Typography variant="caption" color="error.main">{m.rejectionReason}</Typography>}</Stack>
        <Box sx={{ gridColumn: { xs: "2", md: "auto" } }}><Typography sx={{ fontWeight: 650 }}>{(m.viewCount + m.wpViewCount).toLocaleString("th-TH")}</Typography><Typography variant="caption" color="text.secondary">ยอดรับชมรวม</Typography></Box>
        <Stack spacing={.5} sx={{ gridColumn: { xs: "3", md: "auto" } }}><Button href={`/admin/videos/${m.id}`} variant="outlined" size="small">เปิดจัดการ</Button><Button size="small" aria-label={`เมนูเพิ่มเติม ${m.title}`} disabled={busyId === m.id || bulkBusy || pending} onClick={e => setActionMenu({ anchor: e.currentTarget, movie: m })}>เพิ่มเติม ⋯</Button></Stack>
      </Box>; })}
      <Stack direction={{ xs: "column", sm: "row" }} spacing={2} sx={{ alignItems: "center", justifyContent: "space-between", p: 2.5 }}><Typography variant="body2" color="text.secondary">หน้า {pagination.page} / {pagination.totalPages}</Typography><Pagination count={pagination.totalPages} page={pagination.page} onChange={(_, page) => goToPage(page)} disabled={pending || bulkBusy} color="primary" size="small" /></Stack>
    </Paper>
    <Menu anchorEl={actionMenu?.anchor} open={!!actionMenu} onClose={() => setActionMenu(null)}>{menuMovie && [
      canEdit() && <MenuItem key="edit" component="a" href={`/admin/videos/${menuMovie.id}/edit`}>แก้ไขข้อมูล</MenuItem>,
      can(role, "movie:submit-review") && ["DRAFT", "REJECTED"].includes(menuMovie.status) && (role !== "STAFF" || menuMovie.createdBy?.id === currentUserId) && <MenuItem key="process" onClick={() => action(() => submitReview(menuMovie))}>เริ่มประมวลผล</MenuItem>,
      can(role, "movie:publish") && ["APPROVED", "DONE", "PARTIAL", "FAILED"].includes(menuMovie.status) && <MenuItem key="publish" onClick={() => action(() => publishNow(menuMovie))}>ส่งวิดีโอ / อัปเดตหมวดหมู่และแท็ก</MenuItem>,
      can(role, "movie:publish") && ["PARTIAL", "FAILED"].includes(menuMovie.status) && <MenuItem key="retry" onClick={() => action(() => { void retry(menuMovie); })}>ลองใหม่เฉพาะเว็บที่ล้มเหลว</MenuItem>,
      can(role, "movie:publish") && ["DONE", "PARTIAL", "FAILED"].includes(menuMovie.status) && <MenuItem key="overwrite" onClick={() => action(() => publishNow(menuMovie, "overwrite_editorial"))}>เขียนทับบทความ WordPress</MenuItem>,
      <Divider key="divider" />,
      can(role, "movie:archive") && ["APPROVED", "DONE", "PARTIAL", "FAILED", "REJECTED"].includes(menuMovie.status) && <MenuItem key="archive" onClick={() => action(() => archive(menuMovie))}>เก็บถาวร</MenuItem>,
      canDeleteMovies && menuMovie.status !== "PUBLISHING" && <MenuItem key="delete" sx={{ color: "error.main" }} onClick={() => action(() => setConfirmation({ message: `ลบ “${menuMovie.title}” รวมประวัติการกระจายและข้อมูลร่าง? ไม่สามารถย้อนกลับได้`, action: () => { void deleteMovie(menuMovie); } }))}>ลบวิดีโอ</MenuItem>
    ]}</Menu>
    <Dialog open={!!confirmation} onClose={() => setConfirmation(null)} fullWidth maxWidth="xs"><DialogTitle>ยืนยันการดำเนินการ</DialogTitle><DialogContent><Typography>{confirmation?.message}</Typography></DialogContent><DialogActions><Button onClick={() => setConfirmation(null)}>ยกเลิก</Button><Button variant="contained" onClick={() => { const fn = confirmation?.action; setConfirmation(null); fn?.(); }}>ยืนยัน</Button></DialogActions></Dialog>
    <Snackbar open={!!toast} message={toast} autoHideDuration={5000} onClose={() => setToast(null)} />
  </Stack>;
}
