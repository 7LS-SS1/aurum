"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Box, Stack, Paper, Typography, Button, TextField, Chip, Autocomplete, Alert, LinearProgress, Tabs, Tab, Snackbar, Divider, CircularProgress } from "@mui/material";
import { apiFetch, ApiClientError } from "@/lib/api-client";
import { presignAndUpload } from "@/lib/upload-client";

interface SiteRow {
  id: string;
  name: string;
  baseUrl: string;
  healthStatus: "OK" | "ERROR" | "UNKNOWN";
}

interface CategoryRow {
  id: string;
  name: string;
}

interface MainCategoryRow {
  id: string;
  name: string;
}

interface ActorRow {
  id: string;
  name: string;
}

interface PopularTag {
  tag: string;
  count: number;
}

interface InitialMovie {
  id: string;
  title: string;
  slug: string | null;
  excerpt: string | null;
  content: string | null;
  mainCategory: string | null;
  categories: unknown;
  tags: unknown;
  thumbnailUrl: string | null;
  previewUrl: string | null;
  iframeUrl: string | null;
  videoUrl: string | null;
  videoProvider: string | null;
  jwPlayerMediaId: string | null;
  extraMeta: unknown;
  status: string;
  rejectionReason: string | null;
  actorIds?: string[];
}

type WizardStep = "upload" | "details" | "taxonomy" | "review" | "processing" | "complete";

const STEPS: Array<{ key: WizardStep; label: string }> = [
  { key: "upload", label: "อัปโหลดวิดีโอ" },
  { key: "details", label: "รายละเอียด" },
  { key: "taxonomy", label: "หมวดหมู่/แท็ก" },
  { key: "review", label: "ตรวจสอบข้อมูล" },
  { key: "processing", label: "ประมวลผล" },
  { key: "complete", label: "เสร็จสิ้น" },
];

function titleFromFilename(name: string) {
  return name.replace(/\.[^.]+$/, "").replace(/[_-]+/g, " ").trim();
}

function toStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((v): v is string => typeof v === "string") : [];
}

// Matches taxonomyList's z.array(...).max(50) in src/lib/validation.ts — the
// wizard must not let a user build a tag list the API will then reject.
const MAX_TAGS = 50;

export function VideoForm({
  sites,
  categories,
  mainCategories,
  actors,
  initialMovie,
}: {
  sites: SiteRow[];
  categories: CategoryRow[];
  mainCategories: MainCategoryRow[];
  actors: ActorRow[];
  initialMovie?: InitialMovie;
}) {
  const router = useRouter();
  const [step, setStep] = useState<WizardStep>(initialMovie?.videoUrl || initialMovie?.jwPlayerMediaId || initialMovie?.iframeUrl ? "details" : "upload");

  const [title, setTitle] = useState(initialMovie?.title ?? "");
  const [slug, setSlug] = useState(initialMovie?.slug ?? "");
  // The downstream API and WordPress integration still use both fields. Keep
  // them in sync from one editor so staff only enter the description once.
  const [description, setDescription] = useState(initialMovie?.content ?? initialMovie?.excerpt ?? "");
  const [thumbnailUrl, setThumbnailUrl] = useState(initialMovie?.thumbnailUrl ?? "");
  const [videoUrl, setVideoUrl] = useState(initialMovie?.videoUrl ?? "");
  const [previewUrl, setPreviewUrl] = useState(initialMovie?.previewUrl ?? "");
  const [sourceFileName, setSourceFileName] = useState("");
  const [videoProgress, setVideoProgress] = useState<number | null>(null);
  const [thumbProgress, setThumbProgress] = useState<number | null>(null);
  const [previewProgress, setPreviewProgress] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [completedMovieId, setCompletedMovieId] = useState(initialMovie?.id ?? "");

  const [categoryList, setCategoryList] = useState(categories);
  const [selectedCategories, setSelectedCategories] = useState<string[]>(() => toStringArray(initialMovie?.categories));
  const [showAddCategory, setShowAddCategory] = useState(false);
  const [newCategoryName, setNewCategoryName] = useState("");
  const [addingCategory, setAddingCategory] = useState(false);

  const [mainCategoryList, setMainCategoryList] = useState(mainCategories);
  const [mainCategory, setMainCategory] = useState(initialMovie?.mainCategory ?? "");
  const [showAddMainCategory, setShowAddMainCategory] = useState(false);
  const [newMainCategoryName, setNewMainCategoryName] = useState("");
  const [addingMainCategory, setAddingMainCategory] = useState(false);

  const [tags, setTags] = useState<string[]>(() => toStringArray(initialMovie?.tags));
  const [tagInput, setTagInput] = useState("");
  const [popularTags, setPopularTags] = useState<PopularTag[] | null>(null);

  const [selectedActorIds, setSelectedActorIds] = useState<string[]>(() => initialMovie?.actorIds ?? []);

  const videoInput = useRef<HTMLInputElement>(null);
  const thumbInput = useRef<HTMLInputElement>(null);
  const previewInput = useRef<HTMLInputElement>(null);

  const mediaReady = Boolean(videoUrl || initialMovie?.iframeUrl || initialMovie?.jwPlayerMediaId);
  const detailsReady = Boolean(title.trim() && thumbnailUrl);
  const canStartProcessing = mediaReady && detailsReady;
  const canProcessStatus = !initialMovie || ["DRAFT", "REJECTED"].includes(initialMovie.status);

  function notify(msg: string) {
    setToast(msg);
    setTimeout(() => setToast(null), 2800);
  }

  async function onVideoPick(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    setSourceFileName(file.name);
    if (!title.trim()) setTitle(titleFromFilename(file.name));
    setVideoProgress(0);
    setStep("upload");

    try {
      const url = await presignAndUpload(file, "bunny", setVideoProgress);
      setVideoUrl(url);
      notify("อัปโหลดวิดีโอเสร็จ");
      setStep("details");
    } catch (err) {
      notify(err instanceof Error ? err.message : "อัปโหลดวิดีโอไม่สำเร็จ");
    } finally {
      setVideoProgress(null);
      if (videoInput.current) videoInput.current.value = "";
    }
  }

  async function onThumbPick(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    setThumbProgress(0);
    try {
      const url = await presignAndUpload(file, "r2", setThumbProgress);
      setThumbnailUrl(url);
      notify("อัปโหลดรูปหน้าปกเสร็จ");
    } catch (err) {
      notify(err instanceof Error ? err.message : "อัปโหลดรูปไม่สำเร็จ");
    } finally {
      setThumbProgress(null);
      if (thumbInput.current) thumbInput.current.value = "";
    }
  }

  async function onPreviewPick(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    setPreviewProgress(0);
    try {
      const url = await presignAndUpload(file, "r2", setPreviewProgress);
      setPreviewUrl(url);
      notify("อัปโหลดวิดีโอพรีวิวเสร็จ");
    } catch (err) {
      notify(err instanceof Error ? err.message : "อัปโหลดวิดีโอพรีวิวไม่สำเร็จ");
    } finally {
      setPreviewProgress(null);
      if (previewInput.current) previewInput.current.value = "";
    }
  }

  useEffect(() => {
    apiFetch<PopularTag[]>("/api/tags/popular")
      .then(setPopularTags)
      .catch(() => setPopularTags([]));
  }, []);



  async function addNewCategory() {
    const name = newCategoryName.trim();
    if (!name) return;
    setAddingCategory(true);
    try {
      const category = await apiFetch<CategoryRow>("/api/categories", { method: "POST", body: JSON.stringify({ name }) });
      setCategoryList((prev) => (prev.some((c) => c.name.toLowerCase() === category.name.toLowerCase()) ? prev : [...prev, category].sort((a, b) => a.name.localeCompare(b.name, "th"))));
      setSelectedCategories((prev) => (prev.includes(category.name) ? prev : [...prev, category.name]));
      setNewCategoryName("");
      setShowAddCategory(false);
    } catch (err) {
      notify(err instanceof ApiClientError ? err.message : "เพิ่มหมวดหมู่ไม่สำเร็จ");
    } finally {
      setAddingCategory(false);
    }
  }

  function addTag(raw: string) {
    const parts = raw
      .split(",")
      .map((t) => t.trim())
      .filter(Boolean);
    if (!parts.length) return;
    setTags((prev) => {
      let next = prev;
      for (const tag of parts) {
        if (next.some((t) => t.toLowerCase() === tag.toLowerCase())) continue;
        if (next.length >= MAX_TAGS) {
          notify(`แท็กครบ ${MAX_TAGS} รายการแล้ว`);
          break;
        }
        next = [...next, tag];
      }
      return next;
    });
  }

  function removeTag(tag: string) {
    setTags((prev) => prev.filter((t) => t !== tag));
  }

  function onTagInputKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key !== "Enter" && e.key !== ",") return;
    e.preventDefault();
    addTag(tagInput);
    setTagInput("");
  }

  function onNewCategoryKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key !== "Enter") return;
    e.preventDefault();
    addNewCategory();
  }

  async function addNewMainCategory() {
    const name = newMainCategoryName.trim();
    if (!name) return;
    setAddingMainCategory(true);
    try {
      const category = await apiFetch<MainCategoryRow>("/api/main-categories", { method: "POST", body: JSON.stringify({ name }) });
      setMainCategoryList((prev) => (prev.some((c) => c.name.toLowerCase() === category.name.toLowerCase()) ? prev : [...prev, category].sort((a, b) => a.name.localeCompare(b.name, "th"))));
      setMainCategory(category.name);
      setNewMainCategoryName("");
      setShowAddMainCategory(false);
    } catch (err) {
      notify(err instanceof ApiClientError ? err.message : "เพิ่มหมวดหมู่หลักไม่สำเร็จ");
    } finally {
      setAddingMainCategory(false);
    }
  }

  function onNewMainCategoryKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key !== "Enter") return;
    e.preventDefault();
    addNewMainCategory();
  }

  function addAllPopularTags() {
    for (const { tag } of (popularTags ?? []).slice(0, 20)) addTag(tag);
  }

  function validate(): string | null {
    if (!mediaReady) return "กรุณาอัปโหลดวิดีโอก่อน";
    if (!thumbnailUrl) return "กรุณาอัปโหลดรูปหน้าปกก่อน";
    if (!title.trim()) return "กรุณากรอกชื่อเรื่อง";
    if (!mainCategory) return "กรุณาเลือกหมวดหมู่หลัก";
    return null;
  }

  function buildPayload() {
    return {
      title: title.trim(),
      slug: slug.trim() || undefined,
      excerpt: description.trim() || undefined,
      content: description.trim() || undefined,
      mainCategory,
      thumbnailUrl,
      previewUrl: previewUrl.trim() || undefined,
      ...(videoUrl !== (initialMovie?.videoUrl ?? "") || !initialMovie ? { videoUrl, videoProvider: "bunny" } : {}),
      categories: selectedCategories,
      tags,
      actorIds: selectedActorIds,
    };
  }

  async function persist() {
    const payload = buildPayload();
    if (initialMovie) {
      await apiFetch(`/api/movies/${initialMovie.id}`, { method: "PATCH", body: JSON.stringify(payload) });
      return initialMovie.id;
    }
    const movie = await apiFetch<{ id: string }>("/api/movies", { method: "POST", body: JSON.stringify(payload) });
    return movie.id;
  }

  async function saveOnly() {
    const err = validate();
    if (err) return notify(err);
    setSaving(true);
    try {
      const id = await persist();
      notify(initialMovie ? "บันทึกการแก้ไขแล้ว" : "บันทึกวิดีโอแล้ว");
      router.push(`/admin/videos/${id}/preview`);
    } catch (err) {
      notify(err instanceof ApiClientError ? err.message : "บันทึกไม่สำเร็จ");
    } finally {
      setSaving(false);
    }
  }

  async function startProcessing() {
    const err = validate();
    if (err) return notify(err);

    setSaving(true);
    setStep("processing");
    try {
      const id = await persist();
      setCompletedMovieId(id);
      await apiFetch(`/api/movies/${id}/submit-review`, { method: "POST" });
      notify("ประมวลผลสำเร็จ");
      setStep("complete");
      window.setTimeout(() => router.push(`/admin/videos/${id}/preview`), 650);
    } catch (err) {
      setStep("review");
      notify(err instanceof ApiClientError ? err.message : "ประมวลผลไม่สำเร็จ");
    } finally {
      setSaving(false);
    }
  }

  const uploading = videoProgress !== null || thumbProgress !== null || previewProgress !== null;
  const locked = saving || uploading;
  const editorStep = ["upload", "details", "taxonomy", "review"].includes(step);
  return <Stack spacing={3} sx={{ maxWidth: 1280, mx: "auto", pb: 2 }}>
    <Box><Typography variant="h5" sx={{ fontWeight: 700 }}>{initialMovie ? "แก้ไขข้อมูลวิดีโอ" : "เพิ่มวิดีโอใหม่"}</Typography><Typography color="text.secondary">ข้อมูลเนื้อหา ไฟล์ประกอบ และการจัดหมวดหมู่</Typography></Box>
    {initialMovie?.rejectionReason && <Alert severity="warning">{initialMovie.rejectionReason}</Alert>}
    <Tabs value={editorStep ? step : false} onChange={(_, value) => setStep(value)} variant="scrollable" allowScrollButtonsMobile>{STEPS.slice(0,4).map((s, i) => <Tab key={s.key} value={s.key} disabled={locked} label={`${i + 1}. ${s.label}`} />)}</Tabs>
    {step === "upload" && <Paper variant="outlined" sx={{ p: { xs: 3, md: 6 }, textAlign: "center", borderStyle: "dashed" }}><Stack spacing={2} sx={{ alignItems: "center" }}><Typography variant="h5">ไฟล์วิดีโอหลัก</Typography><Typography color="text.secondary">{sourceFileName || (mediaReady ? "มีวิดีโอแล้ว เลือกไฟล์ใหม่เมื่อต้องการแทนที่" : "เลือกวิดีโอเพื่ออัปโหลดไป Bunny Stream")}</Typography><Button component="label" variant="contained" disabled={locked}>เลือกไฟล์วิดีโอ<Box component="input" hidden ref={videoInput} type="file" accept="video/*" onChange={onVideoPick} /></Button>{videoProgress !== null && <Box sx={{ width: "100%" }}><LinearProgress variant="determinate" value={videoProgress} /><Typography>{Math.round(videoProgress)}%</Typography></Box>}{mediaReady && <Button onClick={() => setStep("details")} disabled={locked}>ใช้วิดีโอนี้ต่อ →</Button>}</Stack></Paper>}
    {step === "details" && <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", lg: "minmax(0, 1.6fr) minmax(280px, 1fr)" }, gap: 3 }}>
      <Paper variant="outlined" sx={{ p: 3 }}><Stack spacing={3}><Typography variant="h6">ข้อมูลเนื้อหา</Typography><TextField required label="ชื่อเรื่อง" value={title} disabled={locked} onChange={e => setTitle(e.target.value)} /><TextField label="Slug" value={slug} disabled={locked} onChange={e => setSlug(e.target.value)} helperText="ปล่อยว่างเพื่อสร้างจากชื่อเรื่อง" /><TextField multiline minRows={8} label="คำอธิบายและเนื้อหา" value={description} disabled={locked} onChange={e => setDescription(e.target.value)} /><Divider /><Typography variant="h6">วิดีโอพรีวิว</Typography>{previewUrl && <Box component="video" src={previewUrl} controls muted preload="none" sx={{ width: "100%", maxHeight: 220, borderRadius: 2, bgcolor: "#000" }} />}<TextField label="URL พรีวิว" value={previewUrl} disabled={locked} onChange={e => setPreviewUrl(e.target.value)} /><Stack direction="row" spacing={1}><Button component="label" variant="outlined" disabled={locked}>อัปโหลดพรีวิว<Box component="input" hidden ref={previewInput} type="file" accept="video/*" onChange={onPreviewPick} /></Button><Button color="error" disabled={locked || !previewUrl} onClick={() => setPreviewUrl("")}>นำพรีวิวออก</Button></Stack>{previewProgress !== null && <LinearProgress variant="determinate" value={previewProgress} />}</Stack></Paper>
      <Stack spacing={2}><Paper variant="outlined" sx={{ p: 3 }}><Stack spacing={2}><Typography variant="h6">รูปหน้าปก</Typography>{thumbnailUrl ? <Box component="img" src={thumbnailUrl} alt="ตัวอย่างรูปหน้าปก" sx={{ width: "100%", aspectRatio: "16/9", objectFit: "cover", borderRadius: 2 }} /> : <Box sx={{ p: 5, bgcolor: "action.hover", textAlign: "center", borderRadius: 2 }}>ยังไม่มีรูปหน้าปก</Box>}<Button component="label" variant="outlined" disabled={locked}>เปลี่ยนรูปหน้าปก<Box component="input" hidden ref={thumbInput} type="file" accept="image/*" onChange={onThumbPick} /></Button>{thumbProgress !== null && <LinearProgress variant="determinate" value={thumbProgress} />}</Stack></Paper><Alert severity="info">เว็บไซต์ปลายทางจะเลือกตามหมวดหมู่หลักที่รองรับ มีเว็บไซต์เปิดใช้งาน {sites.length} แห่ง</Alert></Stack>
    </Box>}
    {step === "taxonomy" && <Paper variant="outlined" sx={{ p: 3 }}><Stack spacing={3}>
      <Typography variant="h6">จัดประเภทและค้นพบเนื้อหา</Typography>
      <Autocomplete options={mainCategoryList.map(c => c.name)} value={mainCategory || null} onChange={(_, value) => setMainCategory(value || "")} disabled={locked} renderInput={params => <TextField {...params} required label="ประเภท / หมวดหมู่หลัก" />} />
      <Button sx={{ alignSelf: "start" }} disabled={locked} onClick={() => setShowAddMainCategory(!showAddMainCategory)}>＋ เพิ่มประเภทใหม่</Button>
      {showAddMainCategory && <Stack direction="row" spacing={1}><TextField label="ชื่อประเภทใหม่" value={newMainCategoryName} onChange={e => setNewMainCategoryName(e.target.value)} onKeyDown={onNewMainCategoryKeyDown} /><Button disabled={addingMainCategory || !newMainCategoryName.trim()} onClick={addNewMainCategory}>เพิ่ม</Button></Stack>}
      <Autocomplete multiple options={categoryList.map(c => c.name)} value={selectedCategories} onChange={(_, value) => setSelectedCategories(value)} disabled={locked} renderInput={params => <TextField {...params} label="หมวดหมู่" />} />
      <Button sx={{ alignSelf: "start" }} disabled={locked} onClick={() => setShowAddCategory(!showAddCategory)}>＋ เพิ่มหมวดหมู่ใหม่</Button>
      {showAddCategory && <Stack direction="row" spacing={1}><TextField label="ชื่อหมวดหมู่ใหม่" value={newCategoryName} onChange={e => setNewCategoryName(e.target.value)} onKeyDown={onNewCategoryKeyDown} /><Button disabled={addingCategory || !newCategoryName.trim()} onClick={addNewCategory}>เพิ่ม</Button></Stack>}
      <Divider /><TextField label={`แท็ก (${tags.length}/${MAX_TAGS})`} value={tagInput} disabled={locked} onChange={e => setTagInput(e.target.value)} onKeyDown={onTagInputKeyDown} helperText="กด Enter เพื่อเพิ่ม หรือใช้เครื่องหมายจุลภาคคั่นหลายแท็ก" /><Stack direction="row" spacing={1} useFlexGap sx={{ flexWrap: "wrap" }}>{tags.map(t => <Chip key={t} label={t} disabled={locked} onDelete={() => removeTag(t)} />)}</Stack>
      {!!popularTags?.length && <Box><Button disabled={locked} onClick={addAllPopularTags}>เพิ่มแท็กยอดนิยม 20 แท็ก</Button><Stack direction="row" spacing={1} useFlexGap sx={{ flexWrap: "wrap", mt: 1 }}>{popularTags.map(({ tag }) => <Chip key={tag} label={tag} color={tags.includes(tag) ? "primary" : "default"} variant="outlined" disabled={locked} onClick={() => tags.includes(tag) ? removeTag(tag) : addTag(tag)} />)}</Stack></Box>}
      <Autocomplete multiple options={actors} getOptionLabel={a => a.name} isOptionEqualToValue={(a,b) => a.id === b.id} value={actors.filter(a => selectedActorIds.includes(a.id))} onChange={(_, value) => setSelectedActorIds(value.map(a => a.id))} disabled={locked} renderInput={params => <TextField {...params} label="นักแสดง" />} />
    </Stack></Paper>}
    {step === "review" && <Paper variant="outlined" sx={{ p: 3 }}><Stack spacing={2}><Typography variant="h6">ตรวจสอบก่อนบันทึก</Typography>{thumbnailUrl && <Box component="img" src={thumbnailUrl} alt="รูปปก" sx={{ maxWidth: 400, width: "100%", aspectRatio: "16/9", objectFit: "cover", borderRadius: 2 }} />}<Typography variant="h5">{title || "ยังไม่มีชื่อเรื่อง"}</Typography><Typography color="text.secondary" sx={{ whiteSpace: "pre-wrap" }}>{description || "ยังไม่มีคำอธิบาย"}</Typography><Divider /><Typography>ประเภท: {mainCategory || "ยังไม่ได้เลือก"}</Typography><Stack direction="row" spacing={1} useFlexGap sx={{ flexWrap: "wrap" }}>{selectedCategories.map(c => <Chip key={c} label={c} />)}{tags.map(t => <Chip key={t} label={`#${t}`} variant="outlined" />)}</Stack><Typography color="text.secondary">นักแสดง {selectedActorIds.length} คน · {previewUrl ? "มีวิดีโอพรีวิว" : "ไม่มีวิดีโอพรีวิว"}</Typography></Stack></Paper>}
    {step === "processing" && <Stack spacing={2} sx={{ alignItems: "center", py: 6 }}><CircularProgress /><Typography>กำลังบันทึกและประมวลผลวิดีโอ…</Typography></Stack>}
    {step === "complete" && <Alert severity="success" action={completedMovieId && <Button href={`/admin/videos/${completedMovieId}/preview`}>เปิดตัวอย่าง</Button>}>บันทึกและประมวลผลสำเร็จ</Alert>}
    {editorStep && <Paper variant="outlined" sx={{ position: "sticky", bottom: 16, p: 2, zIndex: 2, boxShadow: 6 }}><Stack direction={{ xs: "column", sm: "row" }} spacing={2} sx={{ alignItems: { sm: "center" } }}><Typography variant="body2" color="text.secondary" sx={{ flex: 1 }}>{uploading ? "กำลังอัปโหลด กรุณารอสักครู่" : canStartProcessing && mainCategory ? "ข้อมูลพร้อมบันทึก" : "ต้องมีวิดีโอ รูปปก ชื่อเรื่อง และประเภท"}</Typography><Button disabled={locked || step === "upload"} onClick={() => setStep(step === "review" ? "taxonomy" : step === "taxonomy" ? "details" : "upload")}>ย้อนกลับ</Button>{step !== "review" ? <Button variant="contained" disabled={locked || !mediaReady} onClick={() => setStep(step === "upload" ? "details" : step === "details" ? "taxonomy" : "review")}>ถัดไป →</Button> : <><Button variant="outlined" disabled={locked || !canStartProcessing || !mainCategory} onClick={saveOnly}>บันทึกข้อมูล</Button>{canProcessStatus && <Button variant="contained" disabled={locked || !canStartProcessing || !mainCategory} onClick={startProcessing}>บันทึกและเริ่มประมวลผล</Button>}</>}</Stack></Paper>}
    <Snackbar open={!!toast} message={toast} onClose={() => setToast(null)} autoHideDuration={5000} />
  </Stack>;
}
