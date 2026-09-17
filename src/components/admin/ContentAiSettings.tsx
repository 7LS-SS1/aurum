"use client";
import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/api-client";

export function ContentAiSettings() {
  const [enabled, setEnabled] = useState(false);
  const [model, setModel] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [hasKey, setHasKey] = useState(false);
  const [busy, setBusy] = useState(true);
  const [message, setMessage] = useState("");
  const [loaded, setLoaded] = useState(false);
  useEffect(() => {
    apiFetch<{ enabled: boolean; model: string; hasApiKey: boolean }>("/api/content-ai")
      .then(data => { setEnabled(data.enabled); setModel(data.model); setHasKey(data.hasApiKey); setLoaded(true); })
      .catch(error => setMessage(error.message)).finally(() => setBusy(false));
  }, []);
  return <form className="panel" style={{ padding: 24, display: "grid", gap: 16, maxWidth: 720 }} onSubmit={async event => {
    event.preventDefault(); setBusy(true); setMessage("");
    try {
      await apiFetch("/api/content-ai", { method: "PUT", body: JSON.stringify({ enabled, model, ...(apiKey ? { apiKey } : {}) }) });
      setApiKey(""); setHasKey(true); setMessage("บันทึกแล้ว — ไปที่หน้าวิดีโอ > ชื่อและ SEO รายเว็บไซต์ เพื่อสร้างและตรวจเนื้อหา");
    } catch (error) { setMessage(error instanceof Error ? error.message : "บันทึกไม่สำเร็จ"); }
    finally { setBusy(false); }
  }}>
    <label><input type="checkbox" checked={enabled} onChange={e => setEnabled(e.target.checked)} /> เปิดสร้างชื่อและ SEO ก่อนนำเข้าวิดีโอใหม่แต่ละเว็บไซต์</label>
    <p>ใช้ได้กับหัวข้อทั่วไป โดยยึดชื่อและเนื้อหาต้นฉบับ ไม่เพิ่มข้อเท็จจริงนอกเรื่อง ใช้แท็กวิดีโอเป็น Keywords อัตโนมัติ หรือระบุในหน้าสร้าง SEO ชื่อที่บันทึกไว้แล้วจะถูกนำกลับมาใช้ การอัปเดตเฉพาะวิดีโอไม่แก้ชื่อหรือ SEO บน WordPress</p>
    <div className="field"><label htmlFor="openai-model">ชื่อโมเดล OpenAI</label>
      <input id="openai-model" name="openai-model" type="text" autoComplete="off" required value={model} onChange={e => setModel(e.target.value)} placeholder="เช่น gpt-4.1-mini" aria-describedby="openai-model-help" />
      <p id="openai-model-help" className="hint">ใช้ model ID ที่บัญชีของคุณเข้าถึงได้และรองรับ Structured Outputs เช่น gpt-4.1-mini ช่องนี้ไม่ใช่ชื่อบัญชีหรือชื่อ API key</p>
    </div>
    <div className="field"><label htmlFor="openai-key">OpenAI API key {hasKey && "(บันทึกไว้แล้ว — เว้นว่างเพื่อใช้ค่าเดิม)"}</label>
      <input id="openai-key" type="password" autoComplete="new-password" required={!hasKey} value={apiKey} onChange={e => setApiKey(e.target.value)} />
    </div>
    <p>ติดตั้ง AURUM Rank Math Bridge และเปิด Rank Math บนเว็บปลายทางก่อนนำเข้า ข้อมูล AI จะถูกส่งไปพร้อมวิดีโอและตรวจการบันทึกกลับ</p>
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
