# สัญญาบริการและศูนย์แจ้งเตือน

อัปเดต 6 พฤศจิกายน 2026

## พฤติกรรม

- อนุมัติเริ่มบริการด้วย `activate` หรือ `sim_activate` ใช้เวลาเซิร์ฟเวอร์ใน transaction เป็น `startsAt` แล้วคำนวณ `endsAt = startsAt + days × 24 ชั่วโมง` แพ็กเกจ 30 วันไม่ใช่เดือนปฏิทิน และแพ็กเกจเดิม 90/180 วันยังใช้จำนวนวันที่ซื้อ
- ป้องกันเริ่มซ้ำทั้งสถานะ/revision และการมีวันเริ่ม/สิ้นสุดอยู่แล้ว การรีเฟรชหรือการเรียกซ้ำไม่เลื่อนสัญญา
- `ContractSummary` แสดงวันเวลาเริ่ม สิ้นสุด และเวลาคงเหลือบนบัญชีลูกค้า หน้าชำระเงิน และรายละเอียด admin โดยแสดงเวลาประเทศไทย ตัวเลขคงเหลืออัปเดตทุกนาทีและใช้เวลาบนอุปกรณ์สำหรับการแสดงผลเท่านั้น สิทธิ์จริงยังยึด timestamps/สถานะจากเซิร์ฟเวอร์
- `/admin/notifications` เป็นกล่องงานร่วมกันของทีม MANAGER ขึ้นไป มีตัวกรองประเภท/สถานะ อ่านแล้ว ตอบคำร้อง ปิดรายการ และโหลดรายการต่อครั้งละ 50
- ตัวนับบน header ตรวจทุก 60 วินาทีเมื่อแท็บมองเห็น รวมทั้งเมื่อกลับมา focus หน้าต่าง สถานะอ่านแล้วเป็นของทั้งทีม ไม่ใช่รายบุคคล

## ประเภทแจ้งเตือน

1. **คำสั่งซื้อใหม่**: บันทึกพร้อม order ใน transaction เดียวกัน สร้างคำสั่งซื้อซ้ำด้วย request เดิมไม่เพิ่มแจ้งเตือนซ้ำ ไม่ย้อนสร้าง new-order alert ให้คำสั่งซื้อเก่าทุกแถว
2. **ปัญหาชำระเงิน**: simulation failed/mismatch, สร้าง PromptPay ไม่ทราบผล, inquiry ผิดพลาด/ลายเซ็น/ยอดหรือ reference ไม่ตรง, และเงินเข้าช้า รวมถึงลูกค้ารายงานว่าชำระไม่ผ่านหรือชำระแล้วสถานะไม่เปลี่ยน ไม่มีการเปลี่ยนเป็น PAID เพราะลูกค้าแจ้งอย่างเดียว
3. **ขอยกเลิก/ปัญหาอื่น**: ลูกค้าส่งจากรายละเอียดใน `/account` หรือ checkout ตรวจ ownership, origin, rate limit, request idempotency และป้องกันคำร้องประเภทเดียวกันที่ยังเปิดอยู่ การส่งหรือปิดคำร้องไม่ยกเลิกบริการ ไม่ปล่อย inventory และไม่คืนเงินเอง พนักงานต้องดำเนินการใน workflow ของ order ก่อนตอบผล
4. **ใกล้สิ้นสุด/ครบกำหนด**: ตรวจ ACTIVE/GRACE/REMOVAL_REQUIRED ที่ `endsAt <= now + 7 วัน` เมื่อ admin เปิดหรือ poll inbox รวมถึงที่พลาดไปขณะไม่มีคนเปิดเว็บ สร้างครั้งเดียวต่อสัญญา ป้องกัน duplicate ด้วย unique key และ lock ประมวลผลไม่เกิน 200 รายการต่อรอบ

รุ่นนี้แจ้งภายในเว็บ ไม่มี email, Telegram, browser push หรือ scheduler ที่ส่งข้อความเมื่อปิดเว็บ หากเพิ่มช่องทางภายนอกในอนาคตต้องกำหนดผู้รับ การยินยอม และ worker/retry เพิ่ม การหมดสัญญาไม่ได้ถอดป้าย WordPress อัตโนมัติ: ใช้ขั้นตอนเดิม `REMOVAL_REQUIRED` และให้เจ้าหน้าที่ยืนยันนำออกก่อนคืนพื้นที่

คำตอบคำร้องลูกค้าปรากฏทั้งในส่วนคำร้องและประวัติ บันทึกปิดแจ้งเตือนระบบภายในเก็บใน inbox และไม่ส่งข้อความบันทึกภายในนั้นให้ลูกค้า

## ข้อมูลและการนำขึ้นระบบ

- Migration ใหม่: `20261106010000_ads_notifications` เพิ่มตาราง notification, unique key, indexes และ FK เท่านั้น ไม่แก้/ย้าย order IDs, เจ้าของ, วันสัญญา, quote, payment references, ไฟล์ หรือ audit เก่า ไม่มีการเปลี่ยน API/embed/media contracts
- ใช้ migration เฉพาะ DB local `127.0.0.1:55439/aurum_ads_test` แล้ว ยังไม่แตะ remote DB และยังไม่ deploy
- ก่อน production: สำรองฐานข้อมูลและทดสอบ restore ใน DB แยก ตรวจ migrations ที่ค้างทั้งหมด (working tree มีงานก่อนหน้านี้ด้วย) ตรวจ FK/table-lock ในช่วง migration แล้ว migrate และ generate Prisma ก่อนเปิดโค้ดที่ใช้ตารางใหม่
- Canary: สั่งซื้อทดสอบหนึ่งรายการ ตรวจแจ้งเตือนและ duplicate; ส่งคำร้อง/ตอบกลับจากบัญชีทดสอบ; อนุมัติสัญญาทดสอบและตรวจ start/end; ตรวจแจ้งเตือนที่ 7 วันและรายการเกินกำหนด โดยไม่ใช้ข้อมูลลูกค้าจริงสร้างเหตุการณ์จำลอง
- Rollback: ย้อนเฉพาะโค้ดถ้าจำเป็น เก็บตาราง notifications/คำร้องและ timestamps ทั้งหมด ห้าม drop ตารางหลังมีข้อมูล ให้พนักงานติดตามคำร้องที่เปิดอยู่ต่อก่อนย้อนรุ่น และตรวจว่ารุ่นเก่ารองรับสถานะ payment ที่ใช้อยู่ด้วย
- Worker draining: N/A รุ่นนี้ไม่มี worker ใหม่ เป็น transaction และ read-time reconciliation; ไม่กระทบ media workers ที่มีอยู่
- ทดสอบ local อย่างเดียวไม่ยืนยันการรับเงินจริงหรือการอนุมัติ Gateway; PromptPay ยังเป็น Sandbox ตามคู่มือเดิม

## การตรวจสอบ

- `scripts/test-ads-notifications.ts`: DB แยก, ownership, idempotency, request conflict, duplicate open request, reply/CAS, cancellation/payment ไม่เปลี่ยนเอง, เริ่มสัญญา 30 วันจริงจากเวลาเซิร์ฟเวอร์และเริ่มซ้ำไม่ได้, expiry 7 วัน/overdue/dedupe, ข้อมูลที่ลูกค้ามองเห็น
- `scripts/test-ads-notifications-http.mjs`: local HTTP auth/origin/owner, ลูกค้าส่งคำร้อง, staff ตอบ, ลูกค้าอ่านผล, ขอยกเลิกไม่หยุดสัญญาเอง ใช้ `--keep-preview` เฉพาะตรวจ UI แล้วต้องล้าง fixture ที่ไฟล์ `artifacts/notification-ui-fixture.json` ระบุ
- `scripts/test-payment-simulation.mjs`: เพิ่ม assert แจ้งเตือน new order หนึ่งครั้งและ failed/mismatch payment พร้อม regression flow เดิม
- `scripts/test-promptpay.ts`: regression ผล Gateway ที่ mock ลงลายเซ็นเท่านั้น ไม่ติดต่อ provider จริง

สคริปต์ข้างต้นมี local database guard และล้างเฉพาะ fixtures ของตัวเอง การตรวจ expiry อาจสร้างแจ้งเตือนให้รายการ local ที่ถึงกำหนดอยู่แล้วตามพฤติกรรมระบบ แต่ไม่แก้วันสัญญาเดิม โดยรุ่นต่ออายุจะ reconcile สถานะ GRACE/SCHEDULED/REMOVAL_REQUIRED ตามเวลาและหลักฐานชำระด้วย (ดู ADS-RENEWALS.md)

ผลตรวจรอบนี้: unit tests ที่เกี่ยวข้อง 22 ข้อ, TypeScript, ESLint และ local DB/HTTP scripts ข้างต้นผ่าน ตรวจ browser ฝั่งลูกค้าวันเวลา/เวลาคงเหลือ/ฟอร์มคำร้อง และฝั่ง admin แจ้งเตือน/ตอบคำร้อง/ตัวนับแล้ว ตรวจยืนยันว่า browser reply ไม่เปลี่ยนวันสิ้นสุด และล้าง fixture ที่สร้างรอบนี้แล้ว ภาพหลักฐานอยู่ใน `artifacts/admin-notifications.png` และ `artifacts/admin-contract-countdown.png` ไม่ได้ยืนยัน mobile viewport ของหน้า admin เพราะตัว override รอบนี้ยังรายงาน 1280px

## กติกาต่ออายุเพิ่มเติม

ดู [ADS-RENEWALS.md](./ADS-RENEWALS.md): ช่วง 3 วันหลังหมดสัญญายังคงป้ายและกันพื้นที่ หากจ่ายทันกำหนดให้รอเจ้าหน้าที่อนุมัติ ไม่ถอดป้ายอัตโนมัติ ระบบแจ้งคำสั่งซื้อต่ออายุใหม่และรอบที่ถึงวันเริ่มแล้วแต่ยังรออนุมัติด้วย
