"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { apiFetch, ApiClientError } from "@/lib/api-client";
import { presignAndUpload } from "@/lib/upload-client";

interface InitialActor {
  id: string;
  name: string;
  age: number | null;
  heightCm: number | null;
  weightKg: number | null;
  measurementBust: string | null;
  measurementWaist: string | null;
  measurementHip: string | null;
  bio: string | null;
  profileImageUrl: string | null;
}

export function ActorForm({ initialActor }: { initialActor?: InitialActor }) {
  const router = useRouter();
  const [name, setName] = useState(initialActor?.name ?? "");
  const [age, setAge] = useState(initialActor?.age?.toString() ?? "");
  const [heightCm, setHeightCm] = useState(initialActor?.heightCm?.toString() ?? "");
  const [weightKg, setWeightKg] = useState(initialActor?.weightKg?.toString() ?? "");
  const [measurementBust, setMeasurementBust] = useState(initialActor?.measurementBust ?? "");
  const [measurementWaist, setMeasurementWaist] = useState(initialActor?.measurementWaist ?? "");
  const [measurementHip, setMeasurementHip] = useState(initialActor?.measurementHip ?? "");
  const [bio, setBio] = useState(initialActor?.bio ?? "");
  const [profileImageUrl, setProfileImageUrl] = useState(initialActor?.profileImageUrl ?? "");
  const [photoProgress, setPhotoProgress] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const photoInput = useRef<HTMLInputElement>(null);

  function notify(msg: string) {
    setToast(msg);
    setTimeout(() => setToast(null), 2800);
  }

  async function onPhotoPick(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setPhotoProgress(0);
    try {
      const url = await presignAndUpload(file, "r2", setPhotoProgress);
      setProfileImageUrl(url);
      notify("อัปโหลดรูปเสร็จ");
    } catch (err) {
      notify(err instanceof Error ? err.message : "อัปโหลดรูปไม่สำเร็จ");
    } finally {
      setPhotoProgress(null);
      if (photoInput.current) photoInput.current.value = "";
    }
  }

  function buildPayload() {
    return {
      name: name.trim(),
      age: age.trim() ? Number(age) : undefined,
      heightCm: heightCm.trim() ? Number(heightCm) : undefined,
      weightKg: weightKg.trim() ? Number(weightKg) : undefined,
      measurementBust: measurementBust.trim() || undefined,
      measurementWaist: measurementWaist.trim() || undefined,
      measurementHip: measurementHip.trim() || undefined,
      bio: bio.trim() || undefined,
      profileImageUrl: profileImageUrl.trim() || undefined,
    };
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return notify("กรุณากรอกชื่อนักแสดง");
    setSaving(true);
    try {
      const payload = buildPayload();
      if (initialActor) {
        await apiFetch(`/api/actors/${initialActor.id}`, { method: "PATCH", body: JSON.stringify(payload) });
        notify("บันทึกการแก้ไขแล้ว");
      } else {
        await apiFetch("/api/actors", { method: "POST", body: JSON.stringify(payload) });
        notify("เพิ่มนักแสดงแล้ว");
      }
      router.push("/admin/actors");
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
        <h3>{initialActor ? "แก้ไขนักแสดง" : "เพิ่มนักแสดงใหม่"}</h3>
      </div>

      <div className="field">
        <label>รูปโปรไฟล์</label>
        <div className="thumb-picker-row">
          {profileImageUrl ? (
            <div className="thumb-preview-card">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={profileImageUrl} alt="รูปโปรไฟล์" />
            </div>
          ) : (
            <div className="thumb-empty">ยังไม่มีรูป</div>
          )}
          <div>
            <input ref={photoInput} type="file" accept="image/jpeg,image/png,image/webp,image/avif" onChange={onPhotoPick} />
            {photoProgress !== null && <div className="hint">กำลังอัปโหลด {Math.round(photoProgress)}%</div>}
          </div>
        </div>
      </div>

      <div className="field">
        <label>
          ชื่อ <span className="req">*</span>
        </label>
        <input type="text" value={name} onChange={(e) => setName(e.target.value)} placeholder="ชื่อนักแสดง" />
      </div>

      <div className="row2">
        <div className="field">
          <label>อายุ</label>
          <input type="number" min={0} max={150} value={age} onChange={(e) => setAge(e.target.value)} placeholder="ปี" />
        </div>
        <div className="field">
          <label>ส่วนสูง (ซม.)</label>
          <input type="number" min={0} max={300} value={heightCm} onChange={(e) => setHeightCm(e.target.value)} placeholder="ซม." />
        </div>
      </div>

      <div className="row2">
        <div className="field">
          <label>น้ำหนัก (กก.)</label>
          <input type="number" min={0} max={500} value={weightKg} onChange={(e) => setWeightKg(e.target.value)} placeholder="กก." />
        </div>
      </div>

      <div className="field">
        <label>สัดส่วน</label>
        <div className="row2" style={{ gridTemplateColumns: "1fr 1fr 1fr" }}>
          <input type="text" value={measurementBust} onChange={(e) => setMeasurementBust(e.target.value)} placeholder="รอบอก" />
          <input type="text" value={measurementWaist} onChange={(e) => setMeasurementWaist(e.target.value)} placeholder="รอบเอว" />
          <input type="text" value={measurementHip} onChange={(e) => setMeasurementHip(e.target.value)} placeholder="รอบสะโพก" />
        </div>
      </div>

      <div className="field">
        <label>ประวัติ/คำอธิบาย</label>
        <textarea value={bio} onChange={(e) => setBio(e.target.value)} placeholder="ประวัติหรือคำอธิบายเกี่ยวกับนักแสดง" rows={5} />
      </div>

      <button className="btn btn-gold btn-block" type="submit" disabled={saving}>
        {initialActor ? "บันทึกการแก้ไข" : "เพิ่มนักแสดง"}
      </button>

      <div className={`toast ${toast ? "show" : ""}`}>{toast}</div>
    </form>
  );
}
