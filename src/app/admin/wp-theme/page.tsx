import Link from "next/link";

const META_FIELDS: Array<{ key: string; legacy: string; meaning: string }> = [
  { key: "aurum_provider", legacy: "video_provider", meaning: '"jwplayer", "bunny", "external" ฯลฯ' },
  { key: "aurum_iframe_url", legacy: "iframe_url", meaning: "URL ฝัง player เต็ม (ใช้ก่อนเสมอถ้ามี)" },
  { key: "aurum_video_url", legacy: "video_url", meaning: "URL วิดีโอตรง/HLS (ใช้เมื่อไม่มี iframe URL)" },
  { key: "aurum_thumbnail_url", legacy: "thumbnail_url", meaning: "รูปปกสำรอง (ใช้เมื่อไม่มี Featured Image)" },
  { key: "aurum_preview_url", legacy: "preview_url", meaning: "คลิปตัวอย่างตอน hover" },
  { key: "aurum_jwplayer_media_id", legacy: "jwplayer_media_id", meaning: "JWPlayer Media ID (อ้างอิง/debug)" },
];

const PREVIEW_CARDS = [
  { grad: "linear-gradient(135deg, #1a2440, #3a1f38)", title: "ราตรีสีทอง", meta: "หนัง · 3 วันที่ผ่านมา" },
  { grad: "linear-gradient(135deg, #0a1a3a, #1a0a3a)", title: "จักรวาลนิรันดร์", meta: "ไซไฟ · 5 วันที่ผ่านมา" },
  { grad: "linear-gradient(135deg, #2a0f0f, #1a1a1a)", title: "นักล่าเงา", meta: "แอ็คชั่น · 4 วันที่ผ่านมา" },
];

export default function WpThemePage() {
  return (
    <section>
      <div className="page-head">
        <h1>
          <span className="g">WordPress Theme</span>
        </h1>
        <p>ธีมสำหรับเว็บ WordPress ปลายทาง — ออกแบบมาให้รองรับข้อมูลวิดีโอที่ AURUM กระจายไปโดยตรง ไม่ต้องใช้ปลั๊กอินเสริม</p>
      </div>

      <div className="panel">
        <div className="panel-head">
          <h3>ดาวน์โหลดธีม</h3>
          <span className="sub">AURUM Video · .zip</span>
        </div>
        <p className="hint">
          ไฟล์ zip พร้อมโครงสร้างโฟลเดอร์ <code>aurum-video/</code> อัปโหลดเข้า Appearance → Themes → Add New → Upload Theme บนเว็บ WordPress ปลายทางได้ทันที (บีบอัดจากไฟล์ในโปรเจกต์นี้สดๆ ทุกครั้งที่กด ไม่มีไฟล์ค้างที่อาจไม่ตรงกับโค้ดล่าสุด)
        </p>
        <a className="btn btn-gold" href="/api/wp-theme/download" style={{ display: "inline-flex", width: "fit-content" }}>
          ดาวน์โหลด aurum-video.zip
        </a>
      </div>

      <div className="panel">
        <div className="panel-head">
          <h3>ตัวอย่างธีม</h3>
          <span className="sub">จำลองหน้าตา — ไม่ใช่ภาพจริงจากเว็บ WordPress</span>
        </div>
        <div
          style={{
            border: "1px solid var(--line)",
            borderRadius: 12,
            overflow: "hidden",
            background: "#0f0f0f",
          }}
        >
          {/* mini topbar */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 14,
              padding: "10px 16px",
              borderBottom: "1px solid var(--line)",
            }}
          >
            <div
              style={{
                width: 22,
                height: 22,
                borderRadius: "50%",
                background: "conic-gradient(from 210deg, #a8842a, #ffe08a, #d4af37, #a8842a)",
                display: "grid",
                placeItems: "center",
                fontSize: 11,
                fontWeight: 900,
                color: "#1a1407",
                flex: "none",
              }}
            >
              A
            </div>
            <span style={{ fontSize: 13, fontWeight: 700, color: "#fff", letterSpacing: "0.05em" }}>AURUM VIDEO</span>
            <div style={{ display: "flex", gap: 10, marginLeft: 8, fontSize: 12.5, color: "var(--muted)" }}>
              <span>หน้าแรก</span>
              <span>หมวดหมู่</span>
              <span>ค้นหา</span>
            </div>
          </div>

          {/* mini grid */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12, padding: 16 }}>
            {PREVIEW_CARDS.map((c) => (
              <div key={c.title}>
                <div style={{ aspectRatio: "16/9", borderRadius: 8, background: c.grad }} />
                <div style={{ marginTop: 8, fontSize: 12.5, fontWeight: 600, color: "#f1f1f1" }}>{c.title}</div>
                <div style={{ marginTop: 2, fontSize: 11, color: "var(--muted)" }}>{c.meta}</div>
              </div>
            ))}
          </div>

          {/* mini single-video mockup */}
          <div style={{ padding: "0 16px 16px" }}>
            <div style={{ aspectRatio: "16/9", borderRadius: 10, background: "#000", display: "grid", placeItems: "center" }}>
              <svg width="28" height="28" viewBox="0 0 24 24" fill="var(--gold-bright)">
                <path d="M8 5v14l11-7z" />
              </svg>
            </div>
            <div style={{ marginTop: 10, fontSize: 14, fontWeight: 700, color: "#fff" }}>ราตรีสีทอง</div>
            <div style={{ marginTop: 3, fontSize: 11.5, color: "var(--muted)" }}>หนัง &middot; 3 วันที่ผ่านมา</div>
          </div>
        </div>
      </div>

      <div className="panel">
        <div className="panel-head">
          <span className="n">1</span>
          <h3>ติดตั้ง</h3>
        </div>
        <ol style={{ paddingLeft: 20, lineHeight: 1.9, color: "var(--text)" }}>
          <li>
            ดาวน์โหลด <code>aurum-video.zip</code> จากด้านบน แล้วอัปโหลดผ่าน Appearance → Themes → Add New → Upload Theme บนเว็บ WordPress ปลายทาง (หรือแตกไฟล์แล้ววางที่ <code>wp-content/themes/aurum-video/</code> ตรงๆ)
          </li>
          <li>ไปที่ Appearance → Themes แล้วเปิดใช้งานธีม &quot;AURUM Video&quot;</li>
          <li>
            ที่หน้า <Link href="/admin/sites">เว็บปลายทาง</Link> ตรวจสอบว่า user ที่ AURUM ใช้ login (Application Password/JWT) มีสิทธิ์ <code>edit_posts</code> ขึ้นไป (เช่น Author) — เพราะธีมนี้เช็คสิทธิ์นี้ก่อนบันทึกข้อมูล meta ของวิดีโอ
          </li>
          <li>
            เก็บค่า <code>postType</code> ของเว็บปลายทางไว้เป็นค่าเริ่มต้น (<code>posts</code>) — เทมเพลตของธีมนี้ออกแบบมาสำหรับโพสต์ประเภทมาตรฐานของ WordPress เท่านั้น
          </li>
        </ol>
      </div>

      <div className="panel">
        <div className="panel-head">
          <span className="n">2</span>
          <h3>ทำไมต้องใช้ธีมนี้ ไม่ใช่ธีมอะไรก็ได้</h3>
        </div>
        <p className="hint" style={{ marginBottom: 0 }}>
          WordPress REST API จะทิ้งฟิลด์ <code>meta</code> ที่ยังไม่ได้ลงทะเบียนด้วย <code>register_post_meta(..., [&apos;show_in_rest&apos; =&gt; true])</code> บนเว็บปลายทางโดยอัตโนมัติ — ธีมนี้ลงทะเบียนฟิลด์ทั้งหมดที่ AURUM ส่งให้เองในไฟล์ <code>inc/meta.php</code> ถ้าใช้ธีมอื่นที่ไม่มีการลงทะเบียนนี้ ข้อมูลวิดีโอจะไม่ถูกบันทึกเลย แม้ AURUM จะกระจายสำเร็จก็ตาม
        </p>
      </div>

      <div className="panel">
        <div className="panel-head">
          <span className="n">3</span>
          <h3>Meta fields ที่ธีมรองรับ</h3>
        </div>
        <table className="dtable">
          <thead>
            <tr>
              <th>Field (aurum_*)</th>
              <th>Legacy alias</th>
              <th>ความหมาย</th>
            </tr>
          </thead>
          <tbody>
            {META_FIELDS.map((f) => (
              <tr key={f.key}>
                <td>
                  <code>{f.key}</code>
                </td>
                <td>
                  <code>{f.legacy}</code>
                </td>
                <td>{f.meaning}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="panel">
        <div className="panel-head">
          <span className="n">4</span>
          <h3>เช็คลิสต์ทดสอบหลังติดตั้ง</h3>
        </div>
        <ol style={{ paddingLeft: 20, lineHeight: 1.9, color: "var(--text)" }}>
          <li>สร้าง/อัปโหลดวิดีโอแบบ JWPlayer แล้วกระจายไปเว็บนี้ — ตรวจว่าโพสต์มี custom field ครบ (Custom Fields panel หรือ <code>wp post meta list</code>) และ iframe เล่นได้</li>
          <li>ทำซ้ำกับวิดีโอ Bunny/.m3u8 — ตรวจว่า hls.js โหลดและเล่นวิดีโอได้</li>
          <li>ตรวจว่าวิดีโอไม่ซ้ำ (ไม่โผล่ 2 รอบใต้เนื้อหา)</li>
          <li>ตรวจหน้ารายการ (หน้าแรก/หมวดหมู่/แท็ก/ค้นหา) ว่าแสดงรูปปกและแบ่งหน้าถูกต้อง</li>
        </ol>
        <p className="hint" style={{ marginBottom: 0 }}>
          รายละเอียดเต็มอยู่ที่ <code>wordpress-theme/aurum-video/README.md</code> ใน repo
        </p>
      </div>
    </section>
  );
}
