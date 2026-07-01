# Multi-Site WP Content Distribution (Backend)

อัปโหลดหนัง **ครั้งเดียว** → กระจาย Video + Metadata ไปเว็บ WordPress หลายเว็บ **พร้อมกัน** ผ่าน WordPress REST API

## สถาปัตยกรรม

```
                ┌──────────────────────────┐
                │  Admin Upload Dashboard  │  (frontend ที่คุณทำไว้แล้ว)
                │  ฟอร์มหนัง + checkbox เว็บ │
                └────────────┬─────────────┘
                             │  REST (JSON)
                             ▼
                ┌──────────────────────────┐
                │   Backend API (Express)  │  src/server.js + routes
                │  /api/movies /distribute │
                └───┬───────────┬──────────┘
                    │           │
       ┌────────────┘           └───────────────┐
       ▼                                         ▼
┌─────────────┐                        ┌──────────────────┐
│  Postgres   │  movies / target_sites │  Cloud Storage   │  (S3 / Bunny)
│ distributions (สถานะรายเว็บ)         │  video + thumbnail│  อัปโหลดจาก frontend
└─────────────┘                        └──────────────────┘
                             │
                Distribution Engine (Promise.allSettled — ยิงพร้อมกัน)
       ┌──────────────┬──────────────┬──────────────┐
       ▼              ▼              ▼              ▼
   WP Site 1      WP Site 2      WP Site 3   ...  WP Site N
  REST API       REST API       REST API        REST API
 (Basic/JWT)    (Basic/JWT)    (Basic/JWT)     (Basic/JWT)
```

**หัวใจของดีไซน์**
1. **เก็บเนื้อหาที่เดียว** ในตาราง `movies` แล้ว map เป็น payload ของ WP ตอนกระจาย
2. **กระจายแบบ parallel** ด้วย `Promise.allSettled` → เว็บไหนล่ม ไม่ทำให้เว็บอื่นพัง และคืน id/url กลับมาทันทีให้ dashboard
3. **สถานะรายเว็บ** ในตาราง `distributions` → retry เฉพาะเว็บที่ `failed` ได้ (ยิง `/distribute` ซ้ำด้วย siteIds เฉพาะตัวที่พลาด)
4. **กุญแจถูกเข้ารหัส** (AES-256-GCM) ก่อนลง DB — ไม่เก็บ plaintext

## ติดตั้ง

```bash
npm install
cp .env.example .env          # ใส่ DATABASE_URL + ENCRYPTION_KEY
psql "$DATABASE_URL" -f schema.sql
npm run dev
```

สร้าง ENCRYPTION_KEY: `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`

## API ที่ frontend เรียก

| Method | Path | ใช้ทำอะไร |
|---|---|---|
| POST | `/api/sites` | ลงทะเบียนเว็บ WP (ส่ง `credential` มา ระบบเข้ารหัสให้) |
| GET | `/api/sites` | รายชื่อเว็บ → เอาไปทำ checkbox |
| POST | `/api/movies` | บันทึกข้อมูลหนัง → ได้ `movie.id` |
| POST | `/api/movies/:id/distribute` | body `{ "siteIds": [1,2,5] }` → คืนผลทุกเว็บ |
| GET | `/api/movies/:id/status` | สถานะ + id/url รายเว็บ |

ตัวอย่าง response ของ `/distribute` (เอาไปแสดงบน dashboard ได้เลย):
```json
{
  "movieId": 7, "status": "partial",
  "summary": { "total": 3, "success": 2 },
  "results": [
    { "site": "Site A", "status": "success", "postId": 482, "url": "https://a.com/?p=482" },
    { "site": "Site B", "status": "success", "postId": 91,  "url": "https://b.com/?p=91" },
    { "site": "Site C", "status": "failed",  "error": "[https://c.com] rest_cannot_create" }
  ]
}
```

## ⚠️ สิ่งที่ต้องเตรียมฝั่ง WordPress ปลายทาง

1. **Application Passwords** — เปิดใช้ใน WP (5.6+ มีในตัว) สร้างที่ Users → Profile → Application Passwords ใช้ user ที่มีสิทธิ์ `editor` ขึ้นไป (อย่าใช้ admin เกินจำเป็น)
2. **Category / Tag = ID ไม่ใช่ชื่อ** — โค้ดจัดการให้แล้ว (`resolveTerm` ค้นหา/สร้าง term ก่อน)
3. **Thumbnail** — ต้องอัปขึ้น Media Library ของแต่ละเว็บก่อน (โค้ด `uploadMediaFromUrl` ทำให้) แล้วค่อยตั้ง `featured_media`
4. **video_url / metadata** — WP REST จะบันทึก `meta` ได้ก็ต่อเมื่อ **register meta ด้วย `show_in_rest => true`** หรือใช้ ACF ที่เปิด REST ไว้ ถ้ายังไม่ register โค้ดจะฝัง video ลงใน `content` เป็น fallback ให้ไม่หาย
   ```php
   // ใส่ใน functions.php / ปลั๊กอินของเว็บปลายทาง
   add_action('init', function () {
     register_post_meta('post', 'video_url', [
       'type' => 'string', 'single' => true, 'show_in_rest' => true,
     ]);
   });
   ```
5. ถ้าใช้ **Custom Post Type** (เช่น `movies`) — ต้องสร้าง CPT ด้วย `show_in_rest => true` และตั้ง `post_type` ของเว็บนั้นใน `/api/sites` เป็น rest_base ของ CPT

## ขยายต่อเมื่อโตขึ้น (เว็บปลายทางเยอะ/หนักขึ้น)

ตอนนี้ใช้ `Promise.allSettled` ยิงตรง เหมาะกับ ~ไม่กี่สิบเว็บต่อครั้ง ถ้าจะสเกลขึ้น แนะนำย้าย `distributeToSite` ไปเข้า **job queue (BullMQ + Redis)** ทำให้ retry/backoff อัตโนมัติ, จำกัด concurrency ต่อเว็บ และ frontend เปลี่ยนมา poll `/status` แทน
