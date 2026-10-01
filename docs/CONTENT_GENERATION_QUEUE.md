# Content Generation Queue

ระบบนี้สร้าง Title/Description ด้วย OpenAI หรือ Grok เป็น batch โดยใช้ PostgreSQL และ Prisma เท่านั้น ไม่มี Redis, BullMQ หรือ Inngest และไม่เขียน WordPress ระหว่างการ generate หรือ approve

## โครงสร้างข้อมูล

- `ContentGenerationJob` เก็บ provider/model snapshot, idempotency key, progress, cursor และ worker lease
- `ContentGenerationItem` เก็บ source snapshot, generated variants, editable draft, fingerprints, retry และผู้ตรวจ
- `ContentGenerationJobLog` เป็น append-only event log ของ job/item และเป็นฐานนับ provider rate window
- unique `(jobId, movieId, siteId)` ป้องกัน item ซ้ำใน batch
- unique `(siteId, approvedTitleNormalized)` จอง Title ตอน approve แบบ atomic เฉพาะเว็บไซต์

## สร้าง batch

`MANAGER` ขึ้นไปเรียก:

หน้า Admin พร้อมใช้งานอยู่ที่ `/admin/content-generation` สำหรับเลือกหลายวิดีโอ หลายเว็บไซต์ ผู้ให้บริการ AI และ Trend Keywords ส่วนหน้า `/admin/content-generation/{jobId}` ใช้ติดตามคิว แก้ draft และ Approve/Reject รายเว็บไซต์ ทั้งสองหน้าจำกัดสิทธิ์ `MANAGER` ขึ้นไป

```http
POST /api/content-generation/jobs
Content-Type: application/json
Idempotency-Key: campaign-2026-10-01-av-01

{
  "movieIds": ["movie-a", "movie-b"],
  "siteIds": ["site-th", "site-av"],
  "provider": "grok",
  "trendKeywords": ["คลิปมาแรง", "AV ญี่ปุ่น"]
}
```

ระบบสร้าง Cartesian product เป็น 4 items และ snapshot source ของแต่ละวิดีโอทันที การส่ง `Idempotency-Key` เดิมพร้อม payload เดิมจะคืน job เดิม การใช้ key เดิมกับ payload ต่างกันจะได้ HTTP 409

อ่านสถานะและรายการ draft:

```http
GET /api/content-generation/jobs/{jobId}
```

ยกเลิก job ที่ยังทำงานอยู่:

```http
POST /api/content-generation/jobs/{jobId}/cancel
```

Worker จะหยุดก่อนเริ่ม item ถัดไป ส่วน provider request ที่เริ่มไปแล้วอาจบันทึก draft ปัจจุบันให้เสร็จก่อนปล่อย lease แต่จะไม่เผยแพร่ WordPress

## Worker

ตั้ง Coolify cron หรือ scheduler ให้เรียก endpoint นี้อย่างสม่ำเสมอ:

```http
POST /api/cron/content-generation-worker
X-System-Key: <SYSTEM_API_KEY>
```

แต่ละ tick claim job ด้วย `lockedBy`/`lockedUntil`, ต่อ lease ด้วย heartbeat, ประมวลผลจำนวนจำกัด และบันทึก `cursor.lastItemId` หลังแต่ละ item ระบบจำกัด concurrency และจำนวน request ต่อนาทีแยก `openai`/`grok` ผ่าน PostgreSQL advisory lock และ job log

Retry เกิดเฉพาะ timeout, HTTP 429 และ 5xx ใช้ exponential backoff 30 วินาทีถึงสูงสุด 15 นาที ค่าอื่นเป็น permanent failure

## Approve และ Reject

หน้า review ต้องส่ง fingerprint ที่อ่านมาพร้อม item เพื่อทำ optimistic concurrency check:

```http
POST /api/content-generation/items/{itemId}/approve
Content-Type: application/json

{
  "expectedSourceFingerprint": "<64-char sha256>",
  "expectedDraftFingerprint": "<64-char sha256>",
  "draftTitle": "ABC-123 Actor ชื่อที่ตรวจแล้ว",
  "draftDescription": "คำบรรยายที่ตรวจแล้ว",
  "draftFocusKeyword": "ABC-123"
}
```

Approve ตรวจ source ปัจจุบันอีกครั้ง, ตรวจ optimistic draft version และกันชื่อซ้ำภายในเว็บไซต์ หากชื่อซ้ำข้ามเว็บไซต์จะคืน warning โดยไม่บล็อก การ approve เปลี่ยนสถานะในฐานข้อมูลเท่านั้น ไม่มีการเรียก WordPress

```http
POST /api/content-generation/items/{itemId}/reject
Content-Type: application/json

{
  "expectedSourceFingerprint": "<64-char sha256>",
  "expectedDraftFingerprint": "<64-char sha256>",
  "reason": "ชื่อยังใกล้กับรายการเดิมเกินไป"
}
```

## ลำดับติดตั้ง

1. สำรองฐานข้อมูลและตรวจว่า release ใช้ Prisma schema revision นี้
2. รัน `npx prisma migrate deploy`
3. รัน `npx prisma generate` ในขั้น build ก่อน `next build`
4. ตั้ง `SYSTEM_API_KEY` และ cron สำหรับ `/api/cron/content-generation-worker`
5. ตรวจว่า OpenAI/Grok profile ที่เลือกมี API key และเปิดใช้งาน
6. สร้าง batch ขนาดเล็ก 1 วิดีโอ × 1 เว็บไซต์ ตรวจ log และ draft
7. ทดสอบแก้ draft, stale fingerprint, duplicate title, approve และ reject
8. ยืนยันว่าไม่มี WordPress request เกิดขึ้นจาก generate/approve ก่อนเปิด batch ขนาดใหญ่

การนำ draft ที่อนุมัติแล้วไปเผยแพร่ WordPress เป็นขั้นถัดไปและต้องเป็น action แยกที่ผู้ใช้สั่งชัดเจน เพื่อรักษา approval gate
