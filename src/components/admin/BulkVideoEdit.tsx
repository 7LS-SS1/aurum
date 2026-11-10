"use client";
import { useState } from "react";
import { Alert, Button, Dialog, DialogTitle, DialogContent, DialogActions, Stack, TextField, MenuItem, FormControlLabel, Checkbox } from "@mui/material";
import { apiFetch } from "@/lib/api-client";
export function BulkVideoEdit({ ids, onSaved, disabled }: { ids: string[]; onSaved: () => Promise<void>; disabled: boolean }) {
  const [open, setOpen] = useState(false), [busy, setBusy] = useState(false), [error, setError] = useState("");
  const [main, setMain] = useState(""), [categories, setCategories] = useState(""), [tags, setTags] = useState("");
  const [changeCategories, setChangeCategories] = useState(false), [changeTags, setChangeTags] = useState(false);
  const [mode, setMode] = useState("append");
  const split = (text: string) => [...new Set(text.split(/[,\n]/).map(v => v.trim()).filter(Boolean))];
  async function save() {
    setBusy(true); setError("");
    try {
      await apiFetch("/api/movies/bulk-edit", { method: "POST", body: JSON.stringify({ ids, mode, ...(main.trim() ? { mainCategory: main.trim() } : {}), ...(changeCategories ? { categories: split(categories) } : {}), ...(changeTags ? { tags: split(tags) } : {}) }) });
      setOpen(false); await onSaved();
    } catch (e) { setError(e instanceof Error ? e.message : "บันทึกไม่สำเร็จ"); }
    finally { setBusy(false); }
  }
  return <>
    <Button variant="contained" disabled={disabled || !ids.length} onClick={() => { setError(""); setOpen(true); }}>แก้ไขรายการที่เลือก ({ids.length})</Button>
    <Dialog open={open} onClose={() => !busy && setOpen(false)} fullWidth maxWidth="sm">
      <DialogTitle>แก้ไขข้อมูล {ids.length} วิดีโอ</DialogTitle>
      <DialogContent><Stack spacing={2} sx={{ pt: 1 }}>
        <Alert severity="info">แก้ไขเฉพาะช่องที่เลือก ข้อมูลอื่นคงเดิม บันทึกใน AURUM ก่อน แล้วจึงส่งใหม่ไปยังเว็บไซต์เมื่อต้องการ</Alert>
        {error && <Alert severity="error">{error}</Alert>}
        <TextField disabled={busy} label="ประเภท / หมวดหมู่หลัก" value={main} onChange={e => setMain(e.target.value)} helperText="เว้นว่างเพื่อคงค่าเดิม" />
        <TextField select disabled={busy} label="วิธีแก้ไขหมวดหมู่และแท็ก" value={mode} onChange={e => setMode(e.target.value)}>
          <MenuItem value="append">เพิ่มต่อจากข้อมูลเดิม</MenuItem><MenuItem value="replace">แทนที่ข้อมูลเดิมทั้งหมด</MenuItem><MenuItem value="remove">ลบเฉพาะค่าที่ระบุ</MenuItem>
        </TextField>
        <FormControlLabel control={<Checkbox disabled={busy} checked={changeCategories} onChange={e => setChangeCategories(e.target.checked)} />} label="แก้ไขหมวดหมู่" />
        <TextField disabled={busy || !changeCategories} label="หมวดหมู่ คั่นด้วยเครื่องหมายจุลภาค" multiline value={categories} onChange={e => setCategories(e.target.value)} />
        <FormControlLabel control={<Checkbox disabled={busy} checked={changeTags} onChange={e => setChangeTags(e.target.checked)} />} label="แก้ไขแท็ก" />
        <TextField disabled={busy || !changeTags} label="แท็ก คั่นด้วยเครื่องหมายจุลภาค" multiline value={tags} onChange={e => setTags(e.target.value)} />
        {mode === "replace" && <Alert severity="warning">ข้อมูลเดิมในช่องที่เลือกจะถูกแทนที่ หากเว้นว่างจะล้างข้อมูลช่องนั้น</Alert>}
      </Stack></DialogContent>
      <DialogActions><Button disabled={busy} onClick={() => setOpen(false)}>ยกเลิก</Button><Button variant="contained" disabled={busy || (!main.trim() && !changeCategories && !changeTags)} onClick={save}>{busy ? "กำลังบันทึก…" : "บันทึกการแก้ไข"}</Button></DialogActions>
    </Dialog>
  </>;
}
