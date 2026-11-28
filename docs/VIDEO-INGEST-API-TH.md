# เชื่อมต่อโปรแกรมภายนอกเพื่อนำเข้าวิดีโอ

## เส้นทางการทำงาน

1. โปรแกรมอัปโหลดวิดีโอและรูปหน้าปกไป Storage ของตนเอง
2. รอให้อัปโหลด/แปลงวิดีโอเสร็จ และ URL พร้อมใช้งาน
3. ส่ง JSON ไป `POST https://YOUR-AURUM-HOST/api/integrations/v1/videos`
4. AURUM สร้างวิดีโอสถานะ `DRAFT` ให้ตรวจและส่งอนุมัติในระบบเดิม

API นี้รับข้อมูลอ้างอิงไฟล์ ไม่รับ multipart หรือไฟล์ binary และไม่อัปโหลด/คัดลอกไฟล์ให้อีกครั้ง ไม่เผยแพร่ WordPress อัตโนมัติ เว็บไซต์ปลายทางถูกเลือกจากเว็บไซต์ที่เปิดใช้งานและรับหมวดหมู่หลัก ณ เวลานำเข้า เช่นเดียวกับการสร้างวิดีโอในหน้าแอดมิน

## ตั้งค่าการเชื่อมต่อ

ตั้ง `VIDEO_INGEST_API_KEY` ใน environment ของ AURUM เป็นค่าที่สุ่มอย่างน้อย 32 ตัวอักษร แล้ว restart/redeploy แอป สร้างค่าได้ด้วย:

```sh
node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"
```

ตั้งค่าเดียวกันในโปรแกรมผู้ส่ง ส่งผ่าน `Authorization: Bearer <KEY>` เท่านั้น เก็บกุญแจใน backend/secret configuration ไม่ฝังในเว็บ frontend กุญแจนี้ใช้เฉพาะการนำเข้าวิดีโอ ไม่ใช่ `SYSTEM_API_KEY` การหมุนกุญแจทำโดยเปลี่ยนค่าทั้งสองฝั่ง; ปิดการนำเข้าโดยลบค่าและ restart แอป ไม่ต้องเพิ่ม database migration

## ข้อมูลที่ส่ง

| ฟิลด์ | จำเป็น | ความหมาย |
|---|---|---|
| source | ใช่ | ชื่อโปรแกรมคงที่ เช่น uploader ใช้ a-z, A-Z, 0-9, _ หรือ - ไม่เกิน 64 ตัว |
| externalId | ใช่ | รหัสวิดีโอถาวรจากโปรแกรม ไม่เกิน 200 ตัว ใช้รหัสเดิมเมื่อ retry |
| videoUrl | ใช่ | URL HTTPS ถาวรของ MP4 หรือ HLS ที่ player เปิดได้ ไม่ใช่ path ในเครื่องหรือหน้าเว็บดูวิดีโอ |
| thumbnailUrl | ใช่ | URL HTTPS ถาวรของรูปหน้าปก |
| title | ใช่ | ชื่อเรื่อง ไม่เกิน 500 ตัว |
| slug | ใช่ | ตัวอักษร/ตัวเลข/ขีดกลาง รองรับภาษาไทย ไม่เกิน 500 ตัว ต้องไม่ซ้ำ |
| content | ใช่ | เนื้อหา ไม่เกิน 20,000 ตัว |
| mainCategory | ใช่ | ชื่อหมวดหมู่หลัก ไม่เกิน 120 ตัว ใช้ชื่อเดียวกับใน AURUM เพื่อจับคู่เว็บไซต์ |
| categories | ไม่ | รายชื่อหมวดหมู่ย่อย ค่าเริ่มต้น [] |
| tags | ไม่ | รายชื่อแท็ก ค่าเริ่มต้น [] สร้างแท็กใหม่ได้และตัดค่าซ้ำ |
| videoProvider | ไม่ | external (ค่าเริ่มต้น), bunny, s3 หรือ r2 |

categories และ tags รับอย่างละไม่เกิน 50 รายการ ชื่อละไม่เกิน 120 ตัว หมวดหมู่เก็บเป็นชื่อในวิดีโอ ไม่สร้างรายการในหน้าจัดการ taxonomy อัตโนมัติ URL ยาวไม่เกิน 2,048 ตัว ไม่มี username/password หรือ fragment; API ไม่ตรวจว่าไฟล์ปลายทางมีอยู่จริง หลีกเลี่ยง signed URL ที่หมดอายุ และตั้งค่าการเล่น/CORS/referrer ของ Storage ให้รองรับโดเมนที่แสดงวิดีโอ

```json
{
  "source": "video-uploader",
  "externalId": "video-000123",
  "videoUrl": "https://media.example.com/videos/000123.mp4",
  "thumbnailUrl": "https://media.example.com/covers/000123.jpg",
  "title": "ตัวอย่างวิดีโอ",
  "slug": "ตัวอย่างวิดีโอ-000123",
  "content": "รายละเอียดวิดีโอ",
  "mainCategory": "ทั่วไป",
  "categories": ["สัมภาษณ์"],
  "tags": ["เบื้องหลัง", "ตัวอย่าง"],
  "videoProvider": "external"
}
```

บันทึกเป็น payload.json แล้วเรียก (ตัวอย่าง shell):

```sh
curl -X POST 'https://YOUR-AURUM-HOST/api/integrations/v1/videos' \
  -H "Authorization: Bearer $VIDEO_INGEST_API_KEY" \
  -H 'Content-Type: application/json' \
  --data-binary @payload.json
```

สำเร็จครั้งแรก HTTP 201:

```json
{"id":"ingest_...","slug":"ตัวอย่างวิดีโอ-000123","status":"DRAFT","replayed":false}
```

## ส่งซ้ำและจัดการข้อผิดพลาด

คู่ source + externalId เป็นรหัสกันซ้ำถาวรในวิดีโอ ส่งข้อมูลเดิมซ้ำได้ HTTP 200 พร้อม replayed=true และสถานะปัจจุบัน โดยไม่เขียนทับการแก้ไขของเจ้าหน้าที่ ทั้งนี้การลบวิดีโอจริงจะลบรหัสกันซ้ำด้วย ส่งข้อมูลต่างจากเดิมด้วยรหัสเดิมจะได้ 409; API รุ่นนี้รองรับการสร้างเท่านั้น การแก้ไขทำใน AURUM

| HTTP | error / การจัดการ |
|---|---|
| 400 | invalid_json — แก้ JSON |
| 401 | unauthorized — ตรวจ Bearer key |
| 409 | external_id_conflict หรือ slug_conflict — ตรวจรหัส/slug ไม่ retry แบบเดิม |
| 413 | payload_too_large — JSON จำกัด 256 KiB |
| 415 | json_required — ต้องเป็น application/json |
| 422 | validation_failed พร้อม issues ระบุฟิลด์ผิด รวมถึงฟิลด์ที่ API ไม่รองรับ |
| 429 | too_many_requests — รอตาม Retry-After; จำกัดรวม 60 ครั้ง/นาที |
| 503 | video_ingest_not_configured — ผู้ดูแลตั้งกุญแจ; concurrent_import_retry — retry ข้อมูลเดิม |
| 500 | internal_server_error — retry ข้อมูลเดิมด้วย exponential backoff |

เมื่อ timeout/เน็ตขาด ให้ retry payload เดิมและรหัสเดิม เช่น 2, 4, 8, 16 วินาที พร้อม jitter และเก็บคิวที่ยังไม่สำเร็จ ห้ามสร้าง externalId ใหม่ทุกครั้งที่ retry จำกัดความถี่ผ่าน limiter เดิมของระบบ: ใช้ Upstash หากตั้งค่าไว้ มิฉะนั้นนับแยกต่อ process (รวมถึงเมื่อ Redis ล้มเหลว)

การทดสอบใน repository ใช้ mock database; ก่อนเปิดใช้งานจริงต้องตั้ง secret, deploy และลองหนึ่งรายการจาก Storage จริง ตรวจว่าเปิดวิดีโอ/รูปได้ และส่งซ้ำแล้วได้ id เดิม
