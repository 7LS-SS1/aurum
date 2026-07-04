"use client";

import { useState, useTransition, type CSSProperties } from "react";
import { apiFetch, ApiClientError } from "@/lib/api-client";
import { can, type Role } from "@/lib/permissions";
import { VideoPlayer } from "@/components/public/VideoPlayer";

export interface NativeControllerConfig {
  accentColor: string;
  controlsList: string;
  disablePictureInPicture: boolean;
  defaultMuted: boolean;
  preload: "none" | "metadata" | "auto";
}

interface ControllerDraft {
  accentColor: string;
  hideDownload: boolean;
  hidePlaybackRate: boolean;
  disablePictureInPicture: boolean;
  defaultMuted: boolean;
  preload: "none" | "metadata" | "auto";
}

function toDraft(config: NativeControllerConfig): ControllerDraft {
  return {
    accentColor: config.accentColor || "#d4af37",
    hideDownload: config.controlsList.includes("nodownload"),
    hidePlaybackRate: config.controlsList.includes("noplaybackrate"),
    disablePictureInPicture: config.disablePictureInPicture,
    defaultMuted: config.defaultMuted,
    preload: config.preload,
  };
}

function toPayload(draft: ControllerDraft): NativeControllerConfig {
  const controlsList = [
    draft.hideDownload ? "nodownload" : "",
    draft.hidePlaybackRate ? "noplaybackrate" : "",
  ]
    .filter(Boolean)
    .join(" ");

  return {
    accentColor: draft.accentColor,
    controlsList,
    disablePictureInPicture: draft.disablePictureInPicture,
    defaultMuted: draft.defaultMuted,
    preload: draft.preload,
  };
}

export function PlayerManager({ initialController, role }: { initialController: NativeControllerConfig; role: Role }) {
  const [draft, setDraft] = useState<ControllerDraft>(() => toDraft(initialController));
  const [saved, setSaved] = useState<ControllerDraft>(() => toDraft(initialController));
  const [toast, setToast] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [previewUrl, setPreviewUrl] = useState("");
  const [posterUrl, setPosterUrl] = useState("");
  const canManage = can(role, "player:manage");

  function notify(msg: string) {
    setToast(msg);
    setTimeout(() => setToast(null), 2400);
  }

  function update(patch: Partial<ControllerDraft>) {
    setDraft((prev) => ({ ...prev, ...patch }));
  }

  function saveController() {
    startTransition(async () => {
      try {
        const res = await apiFetch<{ controller: NativeControllerConfig }>("/api/player/native-controller", {
          method: "PATCH",
          body: JSON.stringify(toPayload(draft)),
        });
        const next = toDraft(res.controller);
        setDraft(next);
        setSaved(next);
        notify("บันทึก AURUM Player แล้ว");
      } catch (err) {
        notify(err instanceof ApiClientError ? err.message : "บันทึกไม่สำเร็จ");
      }
    });
  }

  function reset() {
    setDraft(saved);
  }

  const changed = JSON.stringify(draft) !== JSON.stringify(saved);

  return (
    <div className="ad-grid">
      <div className="panel">
        <div className="panel-head">
          <span className="n">A</span>
          <h3>AURUM Player Controller</h3>
          <span className="sub">Bunny/native video player</span>
        </div>

        <div className="controller-preview-card" style={{ "--controller-accent": draft.accentColor } as CSSProperties}>
          <div className="controller-preview-screen">
            <span className="controller-preview-play">PLAY</span>
          </div>
          <div className="controller-preview-timeline">
            <span />
          </div>
          <div className="controller-preview-controls">
            <b>Play</b>
            <b>{draft.defaultMuted ? "Muted" : "Sound"}</b>
            {!draft.hidePlaybackRate && <b>1x</b>}
            {!draft.disablePictureInPicture && <b>PiP</b>}
            {!draft.hideDownload && <b>Download</b>}
            <em>preload: {draft.preload}</em>
          </div>
        </div>

        <div className="player-controller-grid">
          <div className="field">
            <label>Accent Color</label>
            <div className="color-input-row">
              <input type="color" value={draft.accentColor} onChange={(e) => update({ accentColor: e.target.value })} style={{ width: 46, padding: 3 }} disabled={!canManage} />
              <input type="text" value={draft.accentColor} onChange={(e) => update({ accentColor: e.target.value })} placeholder="#d4af37" disabled={!canManage} />
            </div>
          </div>
          <div className="field">
            <label>Preload</label>
            <select value={draft.preload} onChange={(e) => update({ preload: e.target.value as ControllerDraft["preload"] })} disabled={!canManage}>
              <option value="metadata">metadata</option>
              <option value="none">none</option>
              <option value="auto">auto</option>
            </select>
          </div>
        </div>

        <div className="controller-toggle-row">
          <label>
            <input type="checkbox" checked={draft.hideDownload} onChange={(e) => update({ hideDownload: e.target.checked })} disabled={!canManage} />
            ซ่อนปุ่มดาวน์โหลด
          </label>
          <label>
            <input type="checkbox" checked={draft.hidePlaybackRate} onChange={(e) => update({ hidePlaybackRate: e.target.checked })} disabled={!canManage} />
            ซ่อน playback speed
          </label>
          <label>
            <input
              type="checkbox"
              checked={draft.disablePictureInPicture}
              onChange={(e) => update({ disablePictureInPicture: e.target.checked })}
              disabled={!canManage}
            />
            ปิด Picture-in-Picture
          </label>
          <label>
            <input type="checkbox" checked={draft.defaultMuted} onChange={(e) => update({ defaultMuted: e.target.checked })} disabled={!canManage} />
            เริ่มแบบ muted
          </label>
        </div>

        <div className="player-settings-actions">
          <button className="btn btn-gold" disabled={!canManage || pending || !changed} onClick={saveController}>
            {pending ? "กำลังบันทึก..." : "บันทึก Controller"}
          </button>
          <button className="btn btn-ghost" disabled={!canManage || pending || !changed} onClick={reset}>
            ยกเลิกการเปลี่ยนแปลง
          </button>
        </div>
      </div>

      <div className="rail">
        <div className="panel">
          <div className="panel-head">
            <span className="n">P</span>
            <h3>ทดสอบเล่นจริง</h3>
          </div>
          <div className="field">
            <label>Video URL</label>
            <input type="url" value={previewUrl} onChange={(e) => setPreviewUrl(e.target.value)} placeholder="https://.../video.mp4 หรือ .m3u8" />
          </div>
          <div className="field">
            <label>Poster URL</label>
            <input type="url" value={posterUrl} onChange={(e) => setPosterUrl(e.target.value)} placeholder="https://.../poster.jpg" />
          </div>
          <div className="real-player-preview">
            {previewUrl.trim() ? (
              <VideoPlayer src={previewUrl.trim()} poster={posterUrl.trim() || undefined} controller={toPayload(draft)} />
            ) : (
              <div className="real-player-empty">ใส่ Video URL เพื่อทดสอบ player จริง</div>
            )}
          </div>
        </div>

        <div className="panel">
          <div className="panel-head">
            <span className="n">i</span>
            <h3>การใช้งาน</h3>
          </div>
          <p className="hint" style={{ marginBottom: 10 }}>
            ค่านี้ใช้กับวิดีโอที่เล่นด้วย AURUM native player เช่น Bunny Stream หรือไฟล์ HLS/MP4 โดยตรง
          </p>
          <p className="hint" style={{ marginBottom: 10 }}>
            ไม่ต้องกรอก JWPlayer Player ID, API Key หรือ API Secret แล้ว
          </p>
          <p className="hint">ถ้าวิดีโอเก่าบางรายการยังเป็น JWPlayer iframe การแต่ง controller ต้องทำใน JWP/JWPlayer dashboard แยกต่างหาก</p>
        </div>
      </div>

      <div className={`toast ${toast ? "show" : ""}`}>{toast}</div>
    </div>
  );
}
