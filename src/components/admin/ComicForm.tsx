"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { apiFetch, ApiClientError } from "@/lib/api-client";
import { presignAndUpload } from "@/lib/upload-client";

interface ComicCategoryRow {
  id: string;
  name: string;
}

interface ComicSeriesRow {
  id: string;
  title: string;
}

interface InitialComic {
  id: string;
  title: string;
  slug: string;
  description: string | null;
  authorName: string | null;
  comicType: "MANGA" | "DOUJIN";
  status: "ONGOING" | "COMPLETED" | "HIATUS";
  isOneShot: boolean;
  coverImageUrl: string | null;
  seriesId: string | null;
  categories: { id: string; name: string }[];
  tags: { id: string; name: string }[];
}

const MAX_TAGS = 50;

function toStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((v): v is string => typeof v === "string") : [];
}

export function ComicForm({
  categories,
  series,
  initialComic,
}: {
  categories: ComicCategoryRow[];
  series: ComicSeriesRow[];
  initialComic?: InitialComic;
}) {
  const router = useRouter();
  const [title, setTitle] = useState(initialComic?.title ?? "");
  const [description, setDescription] = useState(initialComic?.description ?? "");
  const [authorName, setAuthorName] = useState(initialComic?.authorName ?? "");
  const [comicType, setComicType] = useState<"MANGA" | "DOUJIN">(initialComic?.comicType ?? "DOUJIN");
  const [status, setStatus] = useState<"ONGOING" | "COMPLETED" | "HIATUS">(initialComic?.status ?? "ONGOING");
  const [isOneShot, setIsOneShot] = useState(initialComic?.isOneShot ?? false);
  const [seriesId, setSeriesId] = useState(initialComic?.seriesId ?? "");
  const [coverImageUrl, setCoverImageUrl] = useState(initialComic?.coverImageUrl ?? "");
  const [coverProgress, setCoverProgress] = useState<number | null>(null);
  const coverInput = useRef<HTMLInputElement>(null);

  const [categoryList, setCategoryList] = useState(categories);
  const [selectedCategories, setSelectedCategories] = useState<string[]>(() => initialComic?.categories.map((c) => c.id) ?? []);
  const [showAddCategory, setShowAddCategory] = useState(false);
  const [newCategoryName, setNewCategoryName] = useState("");
  const [addingCategory, setAddingCategory] = useState(false);

  const [seriesList, setSeriesList] = useState(series);
  const [showAddSeries, setShowAddSeries] = useState(false);
  const [newSeriesTitle, setNewSeriesTitle] = useState("");
  const [addingSeries, setAddingSeries] = useState(false);

  const [tags, setTags] = useState<string[]>(() => toStringArray(initialComic?.tags.map((t) => t.name)));
  const [tagInput, setTagInput] = useState("");

  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  function notify(msg: string) {
    setToast(msg);
    setTimeout(() => setToast(null), 2800);
  }

  async function onCoverPick(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setCoverProgress(0);
    try {
      const url = await presignAndUpload(file, "r2", setCoverProgress);
      setCoverImageUrl(url);
      notify("อัปโหลดรูปปกเสร็จ");
    } catch (err) {
      notify(err instanceof Error ? err.message : "อัปโหลดรูปปกไม่สำเร็จ");
    } finally {
      setCoverProgress(null);
      if (coverInput.current) coverInput.current.value = "";
    }
  }

  function toggleCategory(id: string) {
    setSelectedCategories((prev) => (prev.includes(id) ? prev.filter((c) => c !== id) : [...prev, id]));
  }

  async function addNewCategory() {
    const name = newCategoryName.trim();
    if (!name) return;
    setAddingCategory(true);
    try {
      const category = await apiFetch<ComicCategoryRow>("/api/comic-categories", { method: "POST", body: JSON.stringify({ name }) });
      setCategoryList((prev) => (prev.some((c) => c.name.toLowerCase() === category.name.toLowerCase()) ? prev : [...prev, category].sort((a, b) => a.name.localeCompare(b.name, "th"))));
      setSelectedCategories((prev) => (prev.includes(category.id) ? prev : [...prev, category.id]));
      setNewCategoryName("");
      setShowAddCategory(false);
    } catch (err) {
      notify(err instanceof ApiClientError ? err.message : "เพิ่มหมวดหมู่ไม่สำเร็จ");
    } finally {
      setAddingCategory(false);
    }
  }

  async function addNewSeries() {
    const title = newSeriesTitle.trim();
    if (!title) return;
    setAddingSeries(true);
    try {
      const created = await apiFetch<{ id: string; title: string }>("/api/comic-series", { method: "POST", body: JSON.stringify({ title }) });
      setSeriesList((prev) => [...prev, created].sort((a, b) => a.title.localeCompare(b.title, "th")));
      setSeriesId(created.id);
      setNewSeriesTitle("");
      setShowAddSeries(false);
    } catch (err) {
      notify(err instanceof ApiClientError ? err.message : "เพิ่มซีรีส์ไม่สำเร็จ");
    } finally {
      setAddingSeries(false);
    }
  }

  function addTag(raw: string) {
    const parts = raw.split(",").map((t) => t.trim()).filter(Boolean);
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

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim()) return notify("กรุณากรอกชื่อเรื่อง");
    setSaving(true);
    try {
      const payload = {
        title: title.trim(),
        description: description.trim() || undefined,
        authorName: authorName.trim() || undefined,
        comicType,
        status,
        isOneShot,
        coverImageUrl: coverImageUrl || undefined,
        seriesId: seriesId || null,
        categoryIds: selectedCategories,
        tags,
      };

      if (initialComic) {
        await apiFetch(`/api/comics/${initialComic.id}`, { method: "PATCH", body: JSON.stringify(payload) });
        notify("บันทึกการแก้ไขแล้ว");
        router.push(`/admin/comics/${initialComic.id}`);
      } else {
        const comic = await apiFetch<{ id: string }>("/api/comics", { method: "POST", body: JSON.stringify(payload) });
        notify("สร้างคอมมิคแล้ว");
        router.push(`/admin/comics/${comic.id}`);
      }
      router.refresh();
    } catch (err) {
      notify(err instanceof ApiClientError ? err.message : "บันทึกไม่สำเร็จ");
    } finally {
      setSaving(false);
    }
  }

  return (
    <form className="panel" onSubmit={save}>
      <div className="panel-head">
        <h3>{initialComic ? "แก้ไขคอมมิค" : "เพิ่มคอมมิคใหม่"}</h3>
      </div>

      <div className="field">
        <label>รูปปก</label>
        <div className="thumb-picker-row">
          {coverImageUrl ? (
            <div className="thumb-preview-card">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={coverImageUrl} alt="รูปปก" />
            </div>
          ) : (
            <div className="thumb-empty">ยังไม่มีรูปปก</div>
          )}
          <div>
            <input ref={coverInput} type="file" accept="image/jpeg,image/png,image/webp,image/avif" onChange={onCoverPick} />
            {coverProgress !== null && <div className="hint">กำลังอัปโหลด {Math.round(coverProgress)}%</div>}
          </div>
        </div>
      </div>

      <div className="field">
        <label>
          ชื่อเรื่อง <span className="req">*</span>
        </label>
        <input type="text" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="ชื่อคอมมิค/โดจิน" />
      </div>

      <div className="field">
        <label>คำอธิบาย</label>
        <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={3} placeholder="เรื่องย่อ" />
      </div>

      <div className="row2">
        <div className="field">
          <label>ผู้แต่ง</label>
          <input type="text" value={authorName} onChange={(e) => setAuthorName(e.target.value)} placeholder="ชื่อผู้เขียน/วงการ์ตูน" />
        </div>
        <div className="field">
          <label>ประเภท</label>
          <div className="category-grid">
            <label className="category-option">
              <input type="radio" name="comicType" checked={comicType === "DOUJIN"} onChange={() => setComicType("DOUJIN")} />
              Doujin
            </label>
            <label className="category-option">
              <input type="radio" name="comicType" checked={comicType === "MANGA"} onChange={() => setComicType("MANGA")} />
              Manga
            </label>
          </div>
        </div>
      </div>

      <div className="row2">
        <div className="field">
          <label>สถานะ</label>
          <div className="category-grid">
            <label className="category-option">
              <input type="radio" name="status" checked={status === "ONGOING"} onChange={() => setStatus("ONGOING")} />
              กำลังดำเนินเรื่อง
            </label>
            <label className="category-option">
              <input type="radio" name="status" checked={status === "COMPLETED"} onChange={() => setStatus("COMPLETED")} />
              จบแล้ว
            </label>
            <label className="category-option">
              <input type="radio" name="status" checked={status === "HIATUS"} onChange={() => setStatus("HIATUS")} />
              พักเรื่อง
            </label>
          </div>
        </div>
        <div className="field">
          <label>&nbsp;</label>
          <label className="category-option" style={{ width: "fit-content" }}>
            <input type="checkbox" checked={isOneShot} onChange={(e) => setIsOneShot(e.target.checked)} />
            เรื่องจบในตอนเดียว (One-shot)
          </label>
        </div>
      </div>

      <div className="field">
        <label>ซีรีส์ (ไม่บังคับ)</label>
        <select value={seriesId} onChange={(e) => setSeriesId(e.target.value)}>
          <option value="">ไม่มี</option>
          {seriesList.map((s) => (
            <option key={s.id} value={s.id}>
              {s.title}
            </option>
          ))}
        </select>
        {showAddSeries ? (
          <div className="thumb-picker-row" style={{ marginTop: 10 }}>
            <input
              type="text"
              value={newSeriesTitle}
              onChange={(e) => setNewSeriesTitle(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), addNewSeries())}
              placeholder="ชื่อซีรีส์ใหม่"
              style={{ flex: 1 }}
            />
            <button type="button" className="btn btn-gold" disabled={addingSeries || !newSeriesTitle.trim()} onClick={addNewSeries}>
              เพิ่ม
            </button>
            <button type="button" className="btn-ghost" onClick={() => setShowAddSeries(false)}>
              ยกเลิก
            </button>
          </div>
        ) : (
          <button type="button" className="btn-ghost" style={{ marginTop: 10, padding: "6px 12px", borderRadius: 8, fontSize: 12.5 }} onClick={() => setShowAddSeries(true)}>
            + เพิ่มซีรีส์ใหม่
          </button>
        )}
      </div>

      <div className="field">
        <label>หมวดหมู่</label>
        <div className="category-grid">
          {categoryList.map((c) => (
            <label key={c.id} className="category-option">
              <input type="checkbox" checked={selectedCategories.includes(c.id)} onChange={() => toggleCategory(c.id)} />
              {c.name}
            </label>
          ))}
        </div>
        {showAddCategory ? (
          <div className="thumb-picker-row" style={{ marginTop: 10 }}>
            <input
              type="text"
              value={newCategoryName}
              onChange={(e) => setNewCategoryName(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), addNewCategory())}
              placeholder="ชื่อหมวดหมู่ใหม่"
              style={{ flex: 1 }}
            />
            <button type="button" className="btn btn-gold" disabled={addingCategory || !newCategoryName.trim()} onClick={addNewCategory}>
              เพิ่ม
            </button>
            <button type="button" className="btn-ghost" onClick={() => setShowAddCategory(false)}>
              ยกเลิก
            </button>
          </div>
        ) : (
          <button type="button" className="btn-ghost" style={{ marginTop: 10, padding: "6px 12px", borderRadius: 8, fontSize: 12.5 }} onClick={() => setShowAddCategory(true)}>
            + เพิ่มหมวดหมู่ใหม่
          </button>
        )}
      </div>

      <div className="field">
        <label>
          แท็ก <span style={{ color: "var(--muted)", fontWeight: 400 }}>({tags.length}/{MAX_TAGS})</span>
        </label>
        <div className="tagbox">
          {tags.map((t) => (
            <span key={t} className="tag">
              {t}
              <button type="button" onClick={() => removeTag(t)} aria-label={`ลบแท็ก ${t}`}>
                x
              </button>
            </span>
          ))}
          <input
            type="text"
            value={tagInput}
            onChange={(e) => setTagInput(e.target.value)}
            onKeyDown={onTagInputKeyDown}
            placeholder="พิมพ์แท็กแล้วกด Enter (ใช้ , คั่นได้หลายแท็ก)"
          />
        </div>
      </div>

      <button className="btn btn-gold btn-block" type="submit" disabled={saving}>
        {initialComic ? "บันทึกการแก้ไข" : "สร้างคอมมิค"}
      </button>

      <div className={`toast ${toast ? "show" : ""}`}>{toast}</div>
    </form>
  );
}
