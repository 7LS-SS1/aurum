# ตรวจความพร้อมรุ่นใหม่ — 9 พฤศจิกายน 2026

สถานะ: **ยังไม่อนุมัติให้ migrate/deploy production** จนกว่าจะผ่านรายการด้านล่าง ไม่มีการแก้ schema, restart หรือ deploy บน production ในรอบตรวจนี้

## แก้ไขในรอบนี้

- จำกัดการลองรหัสผ่านแอดมินตาม IP และบัญชี ก่อน query/hash และจำกัดขนาด input
- จำกัด public API ตามขอบเขต path จริง ป้องกันชื่อคล้าย `/api/publicity` หลุดการตรวจ session
- ตรวจเจ้าของคำสั่งซื้อก่อนติดต่อ Stripe; คำขอข้ามบัญชีตอบ 404 โดยไม่ขึ้นกับสถานะผู้ให้บริการ และ draft ที่ยังไม่มี remote ID อ่านสถานะจากฐานข้อมูลได้
- จำกัดจำนวน timestamp ใน rate limiter เมื่อถูกยิงคำขอที่ถูกปฏิเสธ และแก้เวลาสิ้นสุด lockout; ไม่ log error object ของ Redis ที่อาจมีรายละเอียด credential
- รองรับ Origin ของ public/management host ที่ตั้งค่าไว้ชัดเจนเมื่อเปิดการย้าย host โดยไม่เชื่อ forwarded headers
- pin dependency `ip` เป็น `npm:@webpod/ip@0.6.1` พร้อมทดสอบ regression ของ private IP และการแปลง IPv4/IPv6
- ใส่ analytics worker และ preflight script ใน Docker image
- เพิ่ม `npm run release:preflight` ตรวจ runtime config แบบไม่แสดง secret และไม่แก้ข้อมูล
- แยก build สำหรับตรวจรุ่นด้วย `AURUM_RELEASE_REVIEW=true` ไปที่ `.next-release-review` พร้อมเตรียม static assets/Prisma runtime ใน directory เดียวกัน

## หลักฐานการทดสอบ

- Baseline: 68 test files / 515 tests ผ่าน; TypeScript ผ่าน
- ชุดหลังแก้รอบสุดท้าย: **70 test files / 528 tests ผ่านทั้งหมด** (จำกัด 2 workers และ timeout 15 วินาทีขณะ build); รอบก่อนมี bcrypt 2 tests timeout ที่ 5 วินาที ทดสอบแยกผ่านทั้ง 17 tests
- IP regression: 6 tests ผ่าน
- HTTP รอบแรกพบการตรวจบัญชี Stripe ก่อนตรวจ ownership (ได้ 502 แทน 404 เมื่อ provider ใช้งานไม่ได้); แก้แล้วและ regression ส่วน reconciliation ผ่าน 12 tests รวม 2 กรณีใหม่
- ตรวจแพ็กเกจหลังเปลี่ยน: npm audit ทั้ง production/development พบ 0 vulnerabilities ตามฐานข้อมูล ณ เวลาตรวจ ไม่ใช่หลักประกันว่าไม่มีช่องโหว่ที่ยังไม่ถูกรายงาน
- Runtime dependency smoke: image codecs, ZIP glob, tracker health และ WebSocket allow/deny origins ผ่าน
- Preflight: missing config, valid config, unsafe payment flag และ invalid management origin ผ่าน
- TypeScript และ lint ของไฟล์ที่แก้ผ่าน; `prisma migrate deploy` กับฐานข้อมูลทดสอบใหม่ที่ localhost ผ่านครบทุก migration
- Build โหมด production แบบ isolated ผ่าน exit 0 หลังแก้ครั้งสุดท้าย; standalone boot ผ่านพร้อม JavaScript static asset HTTP 200
- HTTP smoke ผ่าน: staff/manager login, member registration, role restrictions, order ownership (ข้ามบัญชี 404), CSRF, price validation, admin/member SSR, raw webhook signature/tampering และปฏิเสธ live event (`artifacts/release-audit-http.log`)
- HTTP ใช้ฐานข้อมูลใหม่ `aurum_review_20261109` ที่ localhost และ Stripe fixture key; ไม่ได้ทดสอบธุรกรรมจริงหรือการสร้าง Checkout บน Stripe จริง และไม่ได้แตะฐานข้อมูล production
- ระหว่าง build ใช้ DB URL ที่เชื่อมต่อไม่ได้โดยตั้งใจเพื่อไม่แตะ DB จริง จึงมี Prisma connection errors ระหว่าง static analysis แต่ build สำเร็จ; ตรวจ prerender manifest พบเฉพาะ `/_not-found` จึงไม่ได้ฝังหน้าข้อมูลว่างเป็น static page รุ่นนี้เป็น artifact ตรวจสอบ ยังต้องสร้าง production image พร้อม environment/hosts ที่ถูกต้องและทำ canary
- Compile ผ่าน มี warning จาก jose ที่อ้าง CompressionStream/DecompressionStream ใน Edge และ warning `<img>` สองตำแหน่ง ไม่ได้ suppress เพื่อให้ผ่าน

## เงื่อนไขที่ยังต้องจัดการบน production

**อัปเดตส่วนไฟล์แนบ:** ผู้ใช้เลือก R2 แทน local storage เป็นหลักแล้ว สร้าง private bucket `aurum-attachments`, เพิ่ม R2 adapter และบันทึก Coolify runtime config แล้ว ทดสอบอัปโหลด/อ่าน metadata/ดาวน์โหลดกับ R2 จริงผ่านโดยใช้ DB ทดสอบแยก ชุดทดสอบ 71 files / 537 tests ผ่าน ไม่มี schema migration เพิ่มและยังไม่ได้ deploy ดู `docs/ATTACHMENT-STORAGE-R2.md` สำหรับค่าจริงและ canary ที่ต้องทำหลัง build รุ่นใหม่ รายการ mount ด้านล่างคงไว้เป็น legacy fallback เท่านั้น ผล build/HTTP ก่อนหน้าไม่ใช่หลักฐานของ adapter ที่เพิ่มภายหลังนี้

ตรวจ Docker container ปัจจุบันผ่าน Coolify แบบอ่านอย่างเดียว: แอป running, mounts=0, `ADS_UPLOAD_DIR`, `SERVICE_WORKER_SECRET`, `SERVICE_PUBLIC_ORIGIN`, `MANAGEMENT_APP_ORIGIN`, `PUBLIC_APP_ORIGIN` ยังไม่ตั้ง; Stripe และ management host ยังปิด

1. **เตรียม storage แล้ว (ยังรอ deploy เพื่อใช้กับแอป):** สร้าง host directory `/data/coolify/applications/dehl5p0oryk334p1fg35s2ug/ads-uploads` เจ้าของ `1001:1001` mode `0750`; บันทึก directory mount ไป `/data/ads-uploads` ใน Coolify และตั้ง `ADS_UPLOAD_DIR=/data/ads-uploads` แบบ runtime-only ตรวจไม่พบตัวแปรเดิมหรือโฟลเดอร์ `/app/.local-ads-uploads`, `/app/uploads`, `/app/storage`, `/data/ads-uploads` ใน container ปัจจุบัน ทดสอบ container ชั่วคราว network-none ด้วย UID 1001 เขียนไฟล์แล้วให้ container ใหม่อ่านกลับผ่าน ลบเฉพาะ probe ที่สร้างเองแล้ว ไม่มีการ restart/deploy หรือแก้ DB ต้องตรวจ mount และอัปโหลด/ดาวน์โหลดผ่านแอปอีกครั้งหลัง deploy; PR mount ใช้ Add suffix เพื่อแยก preview จาก production
2. **เตรียม worker secret และ scheduler ทุก 5 นาทีแล้ว:** secret อยู่ในไฟล์บนเซิร์ฟเวอร์และ mount ผ่าน runtime config; cron ตรวจ guard และยังข้ามงาน production อยู่ ผล local HTTP harness ผ่าน auth, heartbeat และ overlap protection ดู `docs/SERVICE-WORKER-DEPLOYMENT.md` ต้อง deploy/migrate รุ่นใหม่ก่อนเปิด guard และยืนยัน production heartbeat อย่างน้อยสองรอบ; ยังไม่ยืนยัน provider retry จริง
3. ตั้ง HTTPS public origin และ email config หากเปิด recovery/email; ตรวจส่งจริงก่อนเปิดฟีเจอร์ให้ลูกค้า
4. หากย้าย admin ต้องเตรียม DNS/TLS, origins และ authentication callback/cookie แล้วทดสอบทั้งสอง host ก่อนเปิด flag
5. โค้ด Stripe ยังรับเฉพาะ sandbox และปฏิเสธ live key ห้ามเปิด sandbox กับ production DB หรืออ้างว่ารุ่นนี้พร้อมรับเงินจริง การอนุมัติประเภทธุรกิจจาก Stripe ยังเป็นเงื่อนไขแยก
6. สร้าง release commit ที่ระบุไฟล์ครบ ชุดเปลี่ยนแปลงเดิมยังมี untracked files จำนวนมาก ห้าม deploy จาก HEAD เดิมแล้วเข้าใจว่าได้โค้ดใน working tree

## Migration / ข้อมูล / Rollback

- ใช้ backup `E:\aurum-backups\20261109-pre-update-205031` และสำเนา image/filesystem/config/Redis ที่ `/root/aurum-backups/20261109T135733Z`
- การซ้อมจาก dump production ก่อนหน้านี้: 11 migrations ผ่านและข้อมูลคอลัมน์เดิมทั้ง 37 ตารางมี row count/content checksum ตรงกัน ไม่มีการเปลี่ยน IDs, ownership หรือ URLs ของข้อมูลเดิมในการซ้อม
- ข้อจำกัด restore: ทดสอบ app data บน PostgreSQL 18 โดยเว้น provider extension `prisma_postgres`; ยังไม่ใช่ full-provider restore test
- ก่อน cutover พักการรับรายการใหม่และ drain service workers/งานที่กำลังเขียนข้อมูล ทำ backup DB ล่าสุดพร้อมเก็บรายการชำระที่ค้างและไฟล์แนบใหม่ ไม่ทิ้ง callback ของผู้ให้บริการ
- รัน `prisma migrate deploy` เป็น release job แบบชัดเจน ไม่รัน `migrate dev`, `db push`, reset หรือ seed production; ตรวจ DATABASE_URL/DIRECT_URL ว่าเป็นฐานเดียวกันก่อนรัน
- เปิด candidate/canary ก่อนสลับ traffic: login, member ownership, role restrictions, uploads/downloads, quotes/orders, webhook signature/replay, API/embed และ playback เดิม ต้องผ่าน
- Rollback แอปไป image ที่เข้ากับ schema โดยเก็บข้อมูลใหม่ไว้ ไม่ restore dump เก่าทับคำสั่งซื้อที่เกิดหลัง backup หากไม่มีแผน reconcile
- ไม่มีการเปลี่ยน media/transcode worker ในรอบนี้; การ drain media worker เป็น N/A สำหรับ patch นี้ แต่ต้องรักษางานเดิมระหว่าง deploy รุ่นรวม
- ผู้ใช้จำกัดขอบเขตสำรองไว้ที่ project/database; วิดีโอ Bunny ไม่ได้ทำสำเนา bytes แยกและจะไม่แก้หรือลบใน rollout นี้

## แหล่งอ้างอิง dependency

- https://github.com/advisories/GHSA-2p57-rm9w-gvfp
- https://github.com/webpod/ip
