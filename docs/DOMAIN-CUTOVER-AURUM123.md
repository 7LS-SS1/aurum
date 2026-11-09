# เตรียมเชื่อม aurum123.com หลัง DNS / Nameserver

สถานะ: 6 พฤศจิกายน 2026 — เตรียมจาก source ในเครื่อง ยังไม่ได้เปลี่ยน production, DNS, database หรือ R2

## เป้าหมายและข้อมูลก่อนดำเนินการจริง

- เว็บหลัก: `https://aurum123.com`
- R2 สื่อสาธารณะ: เสนอ `media.aurum123.com` ต้องยืนยัน bucket เดิมก่อนเชื่อม
- Comic ใช้ bucket/credentials แยกตามระบบเดิม ไม่รวมเข้ากับ bucket วิดีโอ
- ต้องระบุบริการ hosting, application/resource ID, revision/image ที่ใช้งานจริง, origin และผู้ดูแล Cloudflare ก่อนแก้ค่า
- ตรวจ zone Active, NS ตรงกับผู้ให้บริการ, A/AAAA/CNAME ชี้ปลายทางถูกต้อง รวมถึง DNSSEC/DS และ MX/TXT เดิมหลังย้าย nameserver
- อย่าสร้างแอปหรือฐานข้อมูลใหม่แทนระบบเดิมเพียงเพื่อเพิ่มโดเมน

## 1. บันทึกและสำรองก่อนเปลี่ยน

เก็บค่าปัจจุบันใน secret manager: DNS, proxy/TLS, domain routing, environment, image digest, scheduler และ mount ของไฟล์ ห้ามแนบ secrets ลง Git หรือ log

ตรวจ identity ของ database และ bucket โดยไม่แสดง credentials เก็บจำนวนรายการสำคัญและตัวอย่าง ID/ownership/relations/URL/embed ไว้เทียบหลังเปลี่ยน

ตรวจ backup ของ database ล่าสุดและหลักฐาน restore ไปฐานข้อมูลแยก ต้องไม่ restore ทับระบบที่มีรายการใหม่ ส่วน R2 ให้เก็บ inventory ของ key/size/metadata และยืนยันแนวทางกู้คืนไฟล์แยกต่างหาก: inventory ไม่ใช่สำเนาไฟล์ งานนี้ไม่ดาวน์โหลด ย้าย หรือลบ object

ไฟล์แนบ Ads อยู่บนดิสก์ตาม `src/lib/ads-attachments.ts`:

- production ต้องมี `ADS_UPLOAD_DIR` เป็น absolute path พร้อม persistent volume ที่แอปอ่าน/เขียนได้
- เก็บทั้ง `.bin` และ `.json` ซึ่งมีเจ้าของไฟล์และ metadata สำรองเป็นชุดเดียวกันและทดลองอ่านจากสำเนา
- หากใช้ Docker ตัวอย่าง mount destination คือ `/app/data/ads-uploads` และตั้ง `ADS_UPLOAD_DIR` ให้ตรงกัน แต่ต้องใช้ volume/source ที่มีไฟล์จริง ไม่ mount volume ว่างทับแล้วถือว่าย้ายสำเร็จ
- บัญชี runtime ใน Dockerfile เป็น UID/GID 1001 ตรวจสิทธิ์ของ mount ก่อน restart
- ถ้ามีหลาย replica ต้องเข้าถึง storage เดียวกันได้ ตรวจไฟล์เดิมจากแต่ละ replica
- `.local-ads-uploads` เป็น fallback สำหรับ development; อย่านำ build context ที่มีไฟล์จริงไป deploy โดยไม่ตรวจ exclusions ปัจจุบัน `.dockerignore` ยังไม่ได้ระบุโฟลเดอร์นี้

## 2. เพิ่มโดเมนเว็บกับแอปเดิม

เพิ่ม `aurum123.com` ใน domain routing ของบริการเดิม ใช้ port ที่ deployment จริงกำหนด (Dockerfile ใน repo ใช้ 3000) เปิด HTTPS และตรวจ certificate ทั้ง edge/origin ก่อนเปิด Cloudflare Full (strict) หากใช้ proxy อย่าใช้ Flexible แก้ redirect loop

ใช้ค่าต่อไปนี้เป็นรายการแก้เฉพาะตัวแปร ไม่ใช่ไฟล์ environment สำหรับนำไปแทนทั้งชุด:

```dotenv
AUTH_URL=https://aurum123.com
APP_URL=https://aurum123.com
AURUM_PUBLIC_HOSTNAME=aurum123.com
SERVICE_PUBLIC_ORIGIN=https://aurum123.com
```

รักษา `DATABASE_URL`, `DIRECT_URL`, `AUTH_SECRET`, `AUTH_SECRET_PREVIOUS`, `ENCRYPTION_KEY`, R2 account/bucket/credentials และ integration secrets เดิม การเปลี่ยนโดเมนอาจทำให้ต้อง login ใหม่เพราะ cookies อยู่คนละ host ไม่ใช่ข้อมูลสมาชิกหาย

`PAYMENTS_PUBLIC_ORIGIN` เปลี่ยนเมื่อเตรียม callback ของ gateway ที่ใช้งานจริงครบเท่านั้น การเชื่อมโดเมนไม่ใช่การเปิดรับเงินจริงหรือเปิด email/SMS เปลี่ยน `SERVICE_WORKER_ORIGIN` เฉพาะเมื่อ endpoint ที่ worker ใช้ต้องเปลี่ยน โดยเก็บ worker secret เดิม

อย่าเปิด cache ทั้งเว็บกับ `/api/*`, `/admin/*`, `/account/*`, auth และ checkout ตรวจ cookies/authorization ไม่ถูก cache และ API ไม่ติด challenge ที่ทำให้ integration ใช้งานไม่ได้

รักษา hostname เดิมสำหรับ API/embed และ callback ที่ยังใช้อยู่ อย่า redirect ทั้ง host โดยยังไม่ได้ตรวจ POST, iframe, WordPress และ signature ของ callback

## 3. เพิ่ม R2 Custom Domain โดยไม่ย้ายไฟล์

ตรวจว่า bucket เป็นสื่อที่ตั้งใจเผยแพร่สาธารณะ ห้ามเปิด public domain ให้ bucket ที่รวมหลักฐานหรือไฟล์ส่วนตัว Custom Domain ทำให้ object ที่รู้ URL เข้าถึงได้; CORS ไม่ใช่ระบบสิทธิ์

ใน Cloudflare บัญชีเดียวกับ zone: R2 → bucket เดิม → Settings → Custom Domains → เพิ่ม `media.aurum123.com` ตรวจ DNS ที่ระบบเสนอและรอ Active ไม่ทำ CNAME ไป `r2.dev` เอง

ช่วงแรกคง `R2_PUBLIC_HOSTNAME` และ `NEXT_PUBLIC_R2_PUBLIC_URL` เดิมไว้ ทดสอบ object key เดิมผ่านโดเมนใหม่ก่อน ไม่แก้ URL จำนวนมากใน database ไม่เปลี่ยน S3 endpoint ไปเป็น public hostname

เพิ่ม origin `https://aurum123.com` เข้า CORS โดย merge กับ rules เดิม เก็บ origins ที่ WordPress/เว็บเดิมต้องใช้ ตัวอย่าง rule สำหรับตรวจเทียบก่อนเพิ่ม:

```json
{
  "AllowedOrigins": ["https://aurum123.com"],
  "AllowedMethods": ["GET", "HEAD", "PUT"],
  "AllowedHeaders": ["Content-Type", "Cache-Control", "Range"],
  "ExposeHeaders": ["ETag", "Content-Range", "Accept-Ranges"],
  "MaxAgeSeconds": 3600
}
```

โค้ด presigned PUT ปัจจุบันส่ง Content-Type และ Cache-Control ตรวจ browser preflight จริงและเพิ่มเฉพาะ headers ที่ flow ต้องใช้ อย่าแทน CORS configuration ทั้งชุดด้วยตัวอย่างนี้

ก่อนเปลี่ยน public hostname ในแอป ต้องตรวจเพิ่ม:

- `next.config.ts` อ่าน R2 hostname ตอน build และอนุญาตเพียง hostname ที่ตั้งไว้ หาก URL เก่ายังใช้อยู่ต้องรองรับทั้งเก่าและใหม่ก่อน build ใหม่
- `NEXT_PUBLIC_*` ต้องตรวจค่าที่ฝังตอน build; การแก้ runtime env อย่างเดียวอาจไม่พอ
- R2 URL-to-key helpers ใช้ allowlist hostname การสลับ host อาจทำให้จัดการสื่อเก่าต่างจากเดิม ต้องทดสอบก่อนเปลี่ยน
- เก็บ old domain ให้ใช้ได้ตลอดช่วงที่ยังมี URL เดิม ตรวจ Bunny allowed referrers เมื่อใช้ player ของ Bunny
- ห้ามเพิ่ม lifecycle expiry, cleanup, bucket lock หรือเปลี่ยนสิทธิ์ลบโดยไม่ได้ประเมิน flow เดิม แยกงานป้องกันการลบระยะยาวออกจากการผูกโดเมน

## 4. Gate ก่อน restart / deploy

| Gate | เงื่อนไข |
|---|---|
| Schema/migration | การเพิ่มโดเมนกับ revision เดิม: N/A ไม่มี schema change ห้ามรัน migrate/reset/seed/db push |
| Deploy source ใหม่ | มี local changes และ migrations หลายชุด ห้ามรวม deploy ทั้ง working tree เป็นงาน DNS; ต้อง review release และ schema compatibility แยก |
| Backup/restore | ตรวจ DB recovery และ file recovery ตามข้อ 1 ก่อน restart/เปลี่ยน storage |
| งานค้าง | ถ้าเปลี่ยน routing อย่างเดียวไม่ต้องหยุด worker; ถ้าต้อง restart ให้หยุดรับงานใหม่ชั่วคราว รอ upload/job ที่กำลังทำจบ เก็บสถานะคิว และป้องกัน scheduler ซ้ำ |
| Canary | ทดสอบโดเมนใหม่กับแอปเดิมก่อนประกาศใช้จริง คงทางเข้าเดิมไว้ ไม่เปิด worker ชุดซ้ำ |
| Rollback | เก็บ domain/env/image/mount เดิมและวิธีย้อน routing ให้พร้อม ห้ามล้างข้อมูลเพื่อ rollback |

`docker-entrypoint.sh` ใน source ปัจจุบันไม่ migrate ตอน web restart แต่ยังต้องตรวจ image และ deploy hooks ของระบบจริงว่าไม่มีคำสั่ง migration แฝง

## 5. ตรวจรับหลัง DNS พร้อม

คำสั่งอ่านอย่างเดียวจาก PowerShell:

```powershell
Resolve-DnsName aurum123.com -Type NS
Resolve-DnsName aurum123.com -Type A
Resolve-DnsName aurum123.com -Type AAAA
curl.exe --fail-with-body --max-time 20 -I https://aurum123.com/
curl.exe --fail-with-body --max-time 20 https://aurum123.com/api/health
```

ไม่มี AAAA อาจเป็นค่าที่ตั้งใจไว้ ต้องเทียบกับ DNS configuration ไม่ใช้ผลคำสั่งเดียวตัดสินความพร้อม ตรวจ health route กับ revision จริง; HTTP 200 ไม่ยืนยันความครบของฐานข้อมูล/ไฟล์

รายการตรวจด้วย browser และบัญชีทดสอบ:

1. หน้าแรก/services, login/logout, admin และ account ทำงานผ่าน HTTPS ไม่มี redirect loop หรือ mixed content
2. อ่านรายการเดิม ตัวอย่าง ID/เจ้าของ/relations ตรงกับก่อนเปลี่ยน เปิดไฟล์แนบเดิมได้โดยสิทธิ์ผู้ใช้ถูกต้อง
3. รูป วิดีโอ direct และ iframe ของเดิมยังเล่นได้ ตรวจ seek/Range ได้ 206 ในเส้นทางที่รองรับ ไม่ตีความ 401/403/network error ว่าไฟล์ถูกลบ
4. เปิด object เดียวกันผ่าน R2 host เก่า/ใหม่ เปรียบเทียบขนาด/metadata และเนื้อหาตัวอย่างตามความเหมาะสม
5. เมื่ออนุญาตการทดสอบเขียนบนระบบจริงแล้ว ใช้ไฟล์ทดสอบชื่อใหม่ ตรวจ browser upload/preflight/read และบันทึก key/ID ไว้ ไม่ overwrite หรือลบไฟล์เดิม
6. ตรวจ WordPress API/embed, Bunny referrer, scheduler และงานค้างกลับมาทำต่อโดยไม่ทำงานซ้ำ ไม่ trigger publish จริงเพื่อ smoke test
7. เฝ้าดู errors และ queue หลังสลับ บันทึกเวลาทดสอบ/revision/หลักฐานแยก source, staging และ production

## 6. ย้อนกลับหากตรวจไม่ผ่าน

คืน routing/env เฉพาะที่เปลี่ยนให้แอปเดิม ใช้ image/mount เดิมเมื่อจำเป็น คง database/bucket และข้อมูลที่เพิ่มระหว่างสลับไว้ ไม่ restore backup ทับฐานข้อมูลเพื่อแก้ปัญหา DNS

หากมีไฟล์ใหม่อ้างอิง `media.aurum123.com` แล้ว ต้องคงโดเมนนี้ให้เปิดไฟล์ได้ด้วยแม้ย้อน app hostname คืนค่า CORS แบบรักษา origins ที่ใช้อยู่ ตรวจงานค้างก่อน resume scheduler

## เอกสารอ้างอิง

- [R2 Custom Domain](https://developers.cloudflare.com/r2/buckets/public-buckets/)
- [R2 CORS](https://developers.cloudflare.com/r2/buckets/cors/)
- [Cloudflare Full (strict)](https://developers.cloudflare.com/ssl/origin-configuration/ssl-modes/full-strict/)

หลักฐานรอบนี้: อ่าน source/config และเอกสารผู้ให้บริการเท่านั้น ยังไม่ตรวจ DNS propagation, production credentials, backups, volume, live upload, playback หรือ deployment
