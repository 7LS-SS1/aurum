"use client";
import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/api-client";
import { AI_PROVIDER_DETAILS, type AiProvider } from "@/lib/ai-provider";

type Profile = { model: string; hasApiKey: boolean };
type Settings = Profile & { enabled: boolean; provider: AiProvider; profiles: Record<AiProvider, Profile> };

export function ContentAiSettings() {
  const [enabled, setEnabled] = useState(false);
  const [provider, setProvider] = useState<AiProvider>("openai");
  const [profiles, setProfiles] = useState<Record<AiProvider, Profile>>({ openai: { model: "", hasApiKey: false }, grok: { model: "", hasApiKey: false } });
  const [model, setModel] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [hasKey, setHasKey] = useState(false);
  const [busy, setBusy] = useState(true);
  const [message, setMessage] = useState("");
  const [loaded, setLoaded] = useState(false);
  useEffect(() => {
    apiFetch<Settings>("/api/content-ai")
      .then(data => { setEnabled(data.enabled); setProvider(data.provider); setProfiles(data.profiles); setModel(data.model); setHasKey(data.hasApiKey); setLoaded(true); })
      .catch(error => setMessage(error.message)).finally(() => setBusy(false));
  }, []);
  return <form className="panel" style={{ padding: 24, display: "grid", gap: 16, maxWidth: 720 }} onSubmit={async event => {
    event.preventDefault(); setBusy(true); setMessage("");
    try {
      await apiFetch("/api/content-ai", { method: "PUT", body: JSON.stringify({ provider, enabled, model, ...(apiKey ? { apiKey } : {}) }) });
      setApiKey(""); setHasKey(true); setMessage("บันทึกแล้ว — ใช้ปุ่มสร้างชื่อและคำบรรยายด้วย AI ในหน้าเพิ่มวิดีโอใหม่ได้ทันที");
      setProfiles(current => ({ ...current, [provider]: { model, hasApiKey: true } }));
    } catch (error) { setMessage(error instanceof Error ? error.message : "บันทึกไม่สำเร็จ"); }
    finally { setBusy(false); }
  }}>
    <label><input type="checkbox" checked={enabled} onChange={e => setEnabled(e.target.checked)} /> เปิดใช้ AI สำหรับสร้างชื่อเรื่องและคำบรรยายตอนเพิ่มวิดีโอใหม่</label>
    <p>AI ใช้ข้อมูลชื่อเดิม คำบรรยาย หมวดหมู่ แท็ก และนักแสดงในฟอร์มวิดีโอเท่านั้น ผลลัพธ์จะถูกใส่ในฟอร์มเพื่อให้ตรวจแก้ก่อนเผยแพร่</p>
    <div className="field"><label htmlFor="ai-provider">ผู้ให้บริการ AI</label>
      <select id="ai-provider" disabled={busy || !loaded} value={provider} onChange={e => { const next = e.target.value as AiProvider; setProvider(next); setModel(profiles[next].model); setHasKey(profiles[next].hasApiKey); setApiKey(""); }}>
        <option value="openai">OpenAI</option><option value="grok">Grok (xAI)</option>
      </select>
      <p className="hint">คีย์และโมเดลของ OpenAI และ Grok ถูกเก็บแยกกัน ผู้ให้บริการที่บันทึกล่าสุดจะถูกใช้สร้างข้อความในฟอร์มวิดีโอ</p>
    </div>
    <div className="field"><label htmlFor="ai-model">ชื่อโมเดล {AI_PROVIDER_DETAILS[provider].label}</label>
      <input id="ai-model" name="ai-model" type="text" autoComplete="off" required value={model} onChange={e => setModel(e.target.value)} placeholder={`เช่น ${AI_PROVIDER_DETAILS[provider].modelExample}`} aria-describedby="ai-model-help" />
      <p id="ai-model-help" className="hint">ใช้ model ID ที่บัญชีของคุณเข้าถึงได้และรองรับ Structured Outputs เช่น {AI_PROVIDER_DETAILS[provider].modelExample}</p>
    </div>
    <div className="field"><label htmlFor="ai-key">{AI_PROVIDER_DETAILS[provider].label} API key {hasKey && "(บันทึกไว้แล้ว — เว้นว่างเพื่อใช้ค่าเดิม)"}</label>
      <input id="ai-key" type="password" autoComplete="new-password" required={!hasKey} value={apiKey} onChange={e => setApiKey(e.target.value)} />
    </div>
    <button className="btn btn-gold" disabled={busy || !loaded}>บันทึกการตั้งค่า</button>
    <button className="btn btn-ghost" type="button" disabled={busy || !loaded || !hasKey} onClick={async () => {
      setBusy(true);
      try {
        await apiFetch("/api/content-ai", { method: "POST" });
        setMessage("ยืนยัน API key และโมเดลที่บันทึกไว้ได้แล้ว การสร้างเนื้อหาต้องมีโควตา API คงเหลือ ทดสอบสร้างจริงได้ที่หน้าวิดีโอ");
      } catch (error) { setMessage(error instanceof Error ? error.message : "เชื่อมต่อไม่สำเร็จ"); }
      finally { setBusy(false); }
    }}>ทดสอบการเชื่อมต่อที่บันทึกไว้</button>
    <p role="status" style={{ overflowWrap: "anywhere" }}>{message}</p>
  </form>;
}
