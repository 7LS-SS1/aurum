# ตั้งค่า Stripe Sandbox สำหรับ staging

ตรวจผ่าน Stripe MCP วันที่ 8 พฤศจิกายน 2026:

- บัญชีที่เชื่อมกับโปรเจกต์และผู้ใช้ยืนยันให้ใช้ต่อ: `acct_1UYkx7BzMlPEznUB` — แซนด์บ็อกซ์ Aurum Media, ประเทศ TH, สกุลเงิน THB
- การรับชำระ: Hosted Checkout และ Hosted Invoice แบบชำระครั้งเดียว ราคาออกจากคำสั่งซื้อฝั่งเซิร์ฟเวอร์
- Default payment configuration เปิด Card, Apple Pay และ PromptPay; Google Pay ยังไม่ available การแสดงแต่ละวิธีขึ้นกับอุปกรณ์และเงื่อนไขของ Stripe
- ยังไม่มี webhook endpoint ถาวรในบัญชีนี้ การทดสอบในเครื่องใช้ Stripe CLI listener
- `charges_enabled=false`, `payouts_enabled=false` ในบัญชี Sandbox ที่ตรวจ ผลนี้ไม่ใช่การตรวจบัญชี Live และไม่ได้ยืนยันว่าเปิดรับเงินจริงได้
- Planner review `iguide_61VitjdNAn3PnpiWi41BzMlPEznUB` ยืนยัน Hosted Checkout และ Invoicing ตาม flow เดิม

ในหน้าถามวิธีรับชำระ เลือก **การชำระเงินสำเร็จรูป** ไม่จำเป็นต้องสร้าง Product/Price หรือ Payment Link แยกเพื่อทดสอบ flow นี้ เพราะ AURUM สร้างรายการและยอดตามใบสั่งซื้อเอง

## ปลายทางที่ยังต้องระบุ

ยังไม่มี URL/แอป staging ที่ยืนยันว่าผูกฐานข้อมูลแยก จึงยังไม่ได้สร้าง webhook หรือเปิด scheduler บนเซิร์ฟเวอร์ อย่าตั้ง endpoint ไปยัง production ที่ยังไม่ได้ลง release นี้ และอย่าใช้ฐานข้อมูล production กับ Sandbox

## ค่าของแอป staging ใน Coolify

สร้างแอป staging แยกและ PostgreSQL ที่มีเฉพาะข้อมูลทดสอบ ใช้ Sandbox account ข้างต้นตามที่ผู้ใช้ยืนยัน โดยให้ key และ account ID ตรงกัน เก็บ key ใน secret/environment ของแอป ไม่บันทึกลง Git

```dotenv
STRIPE_ENABLED=true
STRIPE_ENVIRONMENT=sandbox
STRIPE_SANDBOX_DB_CONFIRMED=true
STRIPE_RECONCILIATION_ENABLED=true
STRIPE_ACCOUNT_ID=acct_1UYkx7BzMlPEznUB
SERVICE_EMAIL_ENABLED=false
```

ตั้ง `DATABASE_URL` เป็นฐานข้อมูล staging เท่านั้น และกำหนด `AUTH_URL`/`STRIPE_PUBLIC_BASE_URL` เป็น HTTPS origin ของ staging ใช้ `AUTH_SECRET` ของ staging เอง `STRIPE_SECRET_KEY` แนะนำ restricted Sandbox key ตามสิทธิ์ใน STRIPE-SETUP.md

ใช้ `STRIPE_WEBHOOK_SECRET` ของ endpoint staging ที่สร้างในบัญชีเดียวกัน ห้ามนำ signing secret จาก CLI มาใช้แทน กำหนด `SERVICE_WORKER_SECRET` เป็นค่าสุ่มอย่างน้อย 32 ตัวอักษร และใช้ค่าตรงกันในแอปกับ scheduler

ใน Workbench สร้าง snapshot webhook:

```text
https://<staging-host>/api/public/payments/stripe/webhook
```

ใช้ event list ใน STRIPE-SETUP.md ทดสอบ delivery และให้ได้ HTTP 2xx พร้อมแถว event/คำสั่งซื้อที่ตรงกันในฐานข้อมูล ห้ามใช้แค่หน้า success เป็นหลักฐานว่าจ่ายแล้ว

## Scheduler

สำหรับ scheduled task ที่รัน **ภายใน container แอป staging**:

```text
Schedule: */5 * * * *
Command: node /app/scripts/service-worker.mjs
SERVICE_WORKER_ORIGIN=http://127.0.0.1:3000
```

ถ้ารันคนละ container ให้ใช้ HTTPS origin ที่เข้าถึงแอป staging ได้และส่ง secret ผ่าน environment สคริปต์ส่ง Bearer header ไม่ส่ง secret ผ่าน URL ตัว worker มี database lease กันรันซ้อน; scheduler จะ exit nonzero เมื่อมีการตรวจยอดล้มเหลวแม้ HTTP เป็น 200 ตรวจรายละเอียดที่ `/admin/service-operations` และ `/admin/payments`

## ก่อนเปิดรอบทดสอบ

1. ยืนยัน database identity และแยก storage/email/WordPress destinations จากงานจริง เก็บข้อมูลทดสอบเท่านั้น
2. ซ้อม migration และ backup/restore บน staging ก่อน ข้อมูลใน working tree มี migration สมาชิกและบริการที่ต้องลงตามลำดับ การเพิ่ม worker ครั้งนี้ไม่มี schema ใหม่
3. ทดสอบ VIDEO และ Banner: จ่ายแล้วบันทึกหนึ่งรายการ, webhook ซ้ำไม่ซ้ำออเดอร์, staff ตรวจรับ Banner, refund/partial refund/dispute เข้าสถานะถูกต้อง
4. ปิด listener ชั่วคราวใน staging แล้วตรวจ scheduler ตามเก็บสถานะและบันทึก heartbeat ได้ ทดสอบ lease รันซ้อนและการแจ้ง degraded
5. Canary เฉพาะ staging; ไม่ restart worker เผยแพร่วิดีโอหรือแตะ R2 production การทดสอบในเครื่องยังไม่แทน staging HTTPS/DNS/WAF

Rollback: ปิด `STRIPE_ENABLED` เพื่อหยุดรายการใหม่ แต่คง webhook/reconciliation สำหรับรายการที่เปิดค้าง ถ้าต้องหยุด scheduler ให้รอ job จบก่อนและติดตามรายการด้วยการตรวจสถานะเดิม เก็บ ledger, event receipts และ migration ที่รองรับข้อมูลใหม่ไว้ ห้าม restore snapshot เก่าทับรายการเงินที่เกิดหลัง backup

Live ยังปิด: ต้องยืนยันกิจกรรมธุรกิจจริงกับ Stripe และผ่านการเปิดใช้บัญชี โดยเฉพาะบริการเผยแพร่วิดีโอ/Banner ตามขอบเขตจริง ก่อนพัฒนา/เปิด Live การเปลี่ยน key เพียงอย่างเดียวไม่ทำให้โค้ดรุ่นนี้รับเงินจริง
