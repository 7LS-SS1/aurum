# QR PromptPay — เตรียมเชื่อมต่อ Gateway

อัปเดต 6 พฤศจิกายน 2026 · ร้านค้าบุคคลธรรมดา · เว็บไซต์ aurum123.com

## สถานะการส่งมอบ

เตรียมตัวเชื่อมต่อ **2C2P Sandbox** สำหรับทดสอบ ยังไม่รับเงินจริง และยังไม่ได้ยืนยันว่า 2C2P รับร้านค้ารายนี้ ตัวเชื่อมต่อปฏิเสธ `NODE_ENV=production` และไม่รองรับโหมด live ไม่มีการสมัคร ส่งข้อมูลร้านค้า หรือเปิดบัญชีแทนเจ้าของ

ลำดับงาน: ลูกค้าสั่งซื้อ → ระบบตรวจพื้นที่และสร้างใบสั่งชำระ → เปิด QR บนหน้าของ Gateway → Gateway แจ้งผล → เซิร์ฟเวอร์สอบถามรายการกลับและตรวจยอด/สกุลเงิน/ร้านค้า/ใบสั่งชำระ/ช่องทาง → `PAYMENT_REVIEW` → เจ้าหน้าที่ตรวจรับ → `PAID` → ติดตั้งและอนุมัติ → `ACTIVE` และเริ่มนับสัญญา 30/90/180 วัน

การกลับจากหน้าชำระเงิน รูปสลิป และค่าที่ส่งจาก browser ไม่ทำให้คำสั่งซื้อชำระสำเร็จเอง QR แสดงบน Hosted Payment Page ของ 2C2P ไม่ใช่ QR ที่แอปสร้างขึ้นเอง USDT ยังใช้ระบบจำลองเดิม

## 1. ให้ Gateway ตรวจธุรกิจก่อน

ติดต่อ [2C2P Sales](https://2c2p.com/contact-us/) หรือ [Support](https://support.2c2p.com/hc/en-us/requests/new) เพื่อยืนยันสองประเด็นก่อน: รับบุคคลธรรมดาในประเทศไทยหรือไม่ และรับรูปแบบบริการกับเว็บไซต์ที่ติดโฆษณาจริงหรือไม่

ข้อความร่างสำหรับเจ้าของส่งเอง:

> ต้องการสมัครรับชำระ QR PromptPay ในนามบุคคลธรรมดา ประเทศไทย เว็บไซต์ร้านค้า https://aurum123.com ให้บริการขายพื้นที่โฆษณา Banner, Popup, Fixed และ Video Ads/PR บนเว็บไซต์ความบันเทิง ลูกค้าเลือกเว็บไซต์ ตำแหน่งและระยะเวลา 30/90/180 วัน ชำระเงินก่อน ทีมงานตรวจรับและติดตั้ง แล้วเริ่มสัญญาหลังอนุมัติงาน กรุณายืนยันว่ารับประเภทธุรกิจและบุคคลธรรมดาหรือไม่ พร้อมแจ้งเอกสาร ค่าธรรมเนียม รอบโอนเงิน เงื่อนไขคืนเงิน และขั้นตอนขอ Sandbox/API สำหรับ PromptPay เราจะส่ง URL เว็บไซต์ที่ติดโฆษณาทุกแห่งและตัวอย่างเนื้อหาจริงให้ตรวจสอบด้วย

ก่อนส่ง ให้เติมรายชื่อเว็บไซต์ที่ติดโฆษณาจริง พร้อมระบุเนื้อหาสำหรับผู้ใหญ่หรือเนื้อหาที่มีข้อจำกัด หากมี การเรียกบริการว่า PR ไม่เปลี่ยนข้อกำหนดการรับร้านค้า ต้องเปิดเผยรูปแบบจริงและเก็บผลตอบรับของผู้ให้บริการไว้

[ข้อห้ามของ Omise](https://assets.omise.co/prohibited-businesses) ครอบคลุมธุรกิจเกี่ยวกับสื่อและความบันเทิงสำหรับผู้ใหญ่ จึงไม่ได้เลือก Omise เป็นค่าเริ่มต้นของโครงการนี้ ส่วน 2C2P ยังเป็นผู้ให้บริการที่เสนอให้ติดต่อเพื่อประเมินเท่านั้น ไม่ใช่การรับรองว่าจะอนุมัติ

## 2. เตรียมข้อมูลร้านค้า

- ชื่อผู้ประกอบการและบัญชีธนาคารสำหรับรับเงินที่สอดคล้องกับเอกสารที่ Gateway ขอ ส่งเอกสาร KYC ผ่านช่องทางของ Gateway เท่านั้น ไม่ส่งในแชตหรือ Git
- เว็บไซต์ HTTPS ที่เข้าถึงได้ พร้อมบริการ ราคา ระยะเวลา ช่องทางติดต่อ และเงื่อนไขติดตั้ง/ยกเลิก/คืนเงินที่ตรงกับการขายจริง
- นโยบายข้อมูลส่วนบุคคล และหลักฐานสิทธิ์ขายพื้นที่โฆษณาบนเว็บไซต์ที่ระบุ
- ขอให้ Gateway แจ้งรายการเอกสารบุคคลธรรมดาและเงื่อนไขเฉพาะร้านค้า ไม่ถือว่ารายการข้างต้นเป็นเอกสารครบตามกฎหมายหรือข้อกำหนดของ Gateway

## 3. เมื่อได้รับ Sandbox

ให้ตั้งค่าใน environment ของเครื่องทดสอบ/secret manager เท่านั้น ห้ามใช้ `NEXT_PUBLIC_` ห้าม commit key และห้ามนำ production key มาทดลอง ตัวอย่างใน `.env.example` เว้นค่าว่างและปิดระบบไว้

```dotenv
NODE_ENV=development
ADS_PAYMENT_MODE=off
ADS_PAYMENTS_ENABLED=false
ADS_PROMPTPAY_MODE=sandbox
TWOC2P_MERCHANT_ID=<merchant-id-จาก-Sandbox>
TWOC2P_SECRET_KEY=<secret-จาก-Sandbox>
PAYMENTS_PUBLIC_ORIGIN=https://<โดเมนทดสอบที่เข้าถึงได้จริง>
```

ใช้ฐานข้อมูลทดสอบแยกจาก production และใช้บัญชี/คำสั่งซื้อทดสอบใหม่ ปิด `ADS_PAYMENT_MODE=simulation` เมื่อต้องทดสอบ connector เพราะคำสั่งซื้อ simulation เดิมจะยังใช้ flow จำลอง การเปลี่ยนโหมดไม่แปลงรายการเก่า

`PAYMENTS_PUBLIC_ORIGIN` ต้องเป็น HTTPS origin ไม่มี path/port/query และต้องชี้กลับแอปทดสอบจริง ไม่ตั้ง aurum123.com เพียงเพราะเป็นชื่อร้านค้าหาก DNS ยังไม่ได้ชี้ระบบทดสอบ ห้ามเปลี่ยน production ให้เป็น development เพื่อเปิด connector

Backend callback: `https://<origin>/api/public/payments/2c2p/webhook`

Frontend return: `https://<origin>/api/public/payments/2c2p/return/<order-id>` รองรับ form POST และตอบ 303 ไปหน้าคำสั่งซื้อ โดยไม่อ่านผลจาก form มาเปลี่ยนสถานะ เจ้าของคำสั่งซื้อต้องเข้าสู่ระบบก่อนดูข้อมูล

ให้ Gateway ยืนยันการเปิดช่องทาง **PPQR** และผล Payment Inquiry ของ merchant ที่ได้รับต้องมี `channelCode=ETQ` ตาม mapping ที่ใช้ในโค้ด หาก response จริงต่างจากเอกสารต้องตรวจสัญญา API และแก้พร้อมทดสอบ ห้ามลดการตรวจสอบยอด/ลายเซ็นเพื่อให้ผ่าน

## 4. ทดสอบกับ Gateway จริงใน Sandbox

1. ทดสอบสร้างรายการและเปิด Hosted Payment Page เห็น QR ตามยอด/THB ตรวจว่าเปิดเฉพาะ PromptPay
2. ใช้วิธีจำลองผลที่ Gateway ให้มา ตรวจ callback ที่ลงลายเซ็น และ Inquiry ได้ผลตรงกับ Dashboard ของ Gateway
3. ตรวจการปิด browser, return ก่อน callback, callback ซ้ำ, callback หายแล้วกดตรวจซ้ำ, QR หมดอายุ, ยอดไม่ตรง, timeout และเงินเข้าหลังหมดเวลาจอง
4. ตรวจเจ้าหน้าที่รับรายการใน `/admin/ads-orders/[id]` และลูกค้าเห็นผลในบัญชี วันเริ่มต้องยังว่างก่อนอนุมัติติดตั้ง
5. เก็บหลักฐานโดยปิดบัง secrets, JWT, checkout URL token และข้อมูลลูกค้า

ระบบกันพื้นที่ 30 นาทีภายในแอป ส่วน QR ใช้อายุของ Gateway (Payment Token มีค่าเริ่มต้น 20 นาทีตามเอกสาร) สองเวลานี้ไม่ใช่ค่าเดียวกัน เมื่อหมดเวลาจองจะไม่เปิดลิงก์ชำระเดิม หากพบเงินเข้าช้าส่ง `REFUND_REQUIRED` และไม่แย่งพื้นที่ที่ถูกจองต่อ

หลัง timeout ไม่สร้างใบสั่งชำระใหม่อัตโนมัติ ให้ตรวจ Inquiry ของใบเดิมหรือส่งเจ้าหน้าที่ตรวจสอบ ปุ่มตรวจสอบและ callback เป็นช่องทาง reconciliation ในรุ่นนี้ **ยังไม่มี scheduled reconciliation/alert worker** ต้องจัดทำก่อนเปิดเงินจริง

## 5. Gate ก่อนเปิดรับเงินจริง (ยังไม่ดำเนินการ)

- มีการอนุมัติร้านค้าและเว็บไซต์จริงจาก Gateway พร้อมค่าธรรมเนียม/settlement/refund ที่เจ้าของยอมรับ
- ผ่าน Sandbox กับบัญชี merchant จริง ไม่ใช่เพียง mock API; ยืนยัน callback network, format, channel, QR expiry และเงื่อนไขคืนเงิน
- เพิ่ม live adapter ที่แยก credentials/endpoint/environment และแยก inventory ของรายการทดสอบออกจากเงินจริง ห้ามเปิดด้วยการแก้ URL อย่างเดียว
- เพิ่ม background reconciliation, alert รายการค้าง/ยอดไม่ตรง, monitoring และ runbook ของพนักงาน รวมถึงกระบวนการคืนเงินจริง (ปัจจุบันมีเพียงปิดผลทดสอบคืนเงิน Sandbox)
- ตรวจหน้าเว็บและนโยบายร้านค้า SSL/HTTPS, secret rotation, rate limit ที่ใช้ร่วมกันหลาย instance และสิทธิ์พนักงาน
- สำรอง DB และทดสอบ restore ในฐานข้อมูลแยกก่อน migrate; migration `20261106000000_promptpay_review` ขยาย check constraint เท่านั้น แต่มี table lock ระหว่าง DDL จึงต้องเลือกช่วงเหมาะสม
- Deploy migration ก่อนโค้ดที่เขียนสถานะใหม่ ต้องตรวจ migration ที่ค้างอื่นทั้งหมดใน repository ด้วย รุ่นนี้ไม่เคยรัน migration บน remote DB
- Canary ด้วยคำสั่งซื้อที่ควบคุมได้และยอดทดสอบตามที่ Gateway อนุญาต ตรวจ receipt/settlement/การคืนเงิน ก่อนเปิดให้ลูกค้าทั้งหมด
- Rollback: ปิดการสร้างรายการใหม่ก่อน รักษา callback/reconciliation สำหรับรายการที่อยู่ระหว่างชำระ ห้าม rollback ให้โค้ดเก่ามองข้าม `PAYMENT_REVIEW` แล้วปล่อยพื้นที่ซ้ำ เก็บ snapshot, invoice, reference, revision และ audit ทั้งหมด ไม่ลบสถานะใหม่ออกจาก constraint ตราบใดที่ยังมีข้อมูลใช้สถานะนี้
- Worker draining: รุ่น Sandbox นี้ไม่มี payment worker จึงยังไม่ต้อง drain; เมื่อเพิ่ม worker ต้องหยุดสร้างงานใหม่ รอ/โอนงานค้าง และคง webhook กับ reconciliation ของรายการเดิมก่อนสลับรุ่น

## หลักฐานการทดสอบ local

`src/lib/promptpay.test.ts` ตรวจ config gate, JWT, จำนวนเงินและ checkout host ด้วย mock ส่วน `scripts/test-promptpay.ts` ใช้ DB local ที่กำหนดตายตัวและ provider mock ที่ลงลายเซ็น ตรวจ concurrency, ownership, inventory, reference ซ้ำ, callback ซ้ำ, timeout, late payment และลำดับอนุมัติ สร้างและล้างเฉพาะ fixtures ของตัวเอง ไม่ติดต่อ Gateway ภายนอก

ผลตรวจ 6 พฤศจิกายน 2026: unit tests ที่เกี่ยวข้องผ่าน 27 ข้อ, TypeScript และ ESLint เฉพาะส่วนแก้ไขผ่าน, `PROMPTPAY_LOCAL_OK`, `PROMPTPAY_HTTP_OK` และ regression `PAYMENT_SIMULATION_OK` ผ่าน ตรวจหน้าพนักงานใน browser ด้วย fixture Sandbox แล้วล้าง fixture ออก มีภาพหลักฐาน `artifacts/promptpay-admin-sandbox.png` ยังไม่ได้ทดสอบกับ merchant Sandbox ของ 2C2P จริง ไม่ได้ build/deploy production และไม่ได้รับเงินจริง

`scripts/test-promptpay-http.mjs` ตรวจ API จริงที่ localhost:3007 ในสถานะปิด Gateway: authentication, ownership, origin, body validation, หน้า checkout และการไม่เปลี่ยนรายการเป็นชำระแล้ว โดยสร้าง/ล้างเฉพาะบัญชีและรายการทดสอบของสคริปต์

คำสั่ง (ต้องตรวจ URL ฐานข้อมูลก่อนทุกครั้ง):

```powershell
$env:DATABASE_URL='postgresql://postgres:local-ads-test@127.0.0.1:55439/aurum_ads_test'
npx tsx scripts/test-promptpay.ts
node scripts/test-promptpay-http.mjs
npx vitest run src/lib/promptpay.test.ts src/lib/ads-order-workflow.test.ts
```

## เอกสารอ้างอิงของผู้ให้บริการ

- [Payment Token](https://developer.2c2p.com/docs/api-payment-token) และ [Request parameters](https://developer.2c2p.com/docs/api-payment-token-request-parameter)
- [Payment Inquiry](https://developer.2c2p.com/docs/api-payment-inquiry) และ [Response parameters](https://developer.2c2p.com/docs/api-payment-inquiry-response-parameter)
- [Backend callback](https://developer.2c2p.com/docs/api-payment-response-backend) และ [JWT](https://developer.2c2p.com/docs/json-web-tokens-jwt)
- [Frontend return](https://developer.2c2p.com/docs/api-payment-response-frontend)
- [Payment channel reference รุ่น 4.0.2 — PPQR](https://developer.2c2p.com/v4.0.2/docs/reference-payment-channels) และ [Payment scheme — ETQ](https://developer.2c2p.com/docs/reference-codes-payment-scheme) ต้องยืนยันกับ merchant Sandbox ปัจจุบันอีกครั้ง
