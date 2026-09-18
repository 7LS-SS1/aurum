# ซ่อมงานเผยแพร่ AURUM

## ตรวจพบแล้ว

- การอัปโหลดไฟล์ไป Bunny กับการเผยแพร่โพสต์ WordPress เป็นคนละขั้นตอน ปุ่มนี้ซ่อมการเผยแพร่ ไม่อัปโหลดไฟล์วิดีโอใหม่
- เส้นทางเพิ่มวิดีโอเดิมส่งไปหลายเว็บไซต์ในคำขอเดียว ส่วน resync มี SiteSyncJob และ worker อยู่แล้ว
- retry ในหน้าวิดีโอแสดงเฉพาะ PARTIAL/FAILED แต่ Distribution FAILED สามารถเกิดใต้ Movie DONE ได้
- resync เดิมไม่รวม Movie FAILED จึงใช้แทนการซ่อมทั้งหมดไม่ได้
- การแก้ seo_generation_validation_failed อยู่ใน commit 1a0bbaa ส่วนงานซ่อมนี้ใช้ขั้นตอนส่งและตรวจ WordPress เดิม

## สิ่งที่เพิ่ม

- Dashboard การ์ดวิดีโอล้มเหลวและ Distribution Failed เปิด `/admin/distributions/repair`
- ผู้ใช้ MANAGER/HEAD ดูจำนวนงานต่อเว็บ เลือกเว็บ แล้วกด “ซ่อมและส่งซ้ำ” ได้
- `GET /api/distributions/repair` อ่านอย่างเดียว ไม่ล้าง error หรือเปลี่ยนสถานะ
- POST จัดคิวเฉพาะ Distribution FAILED ของ Movie APPROVED/DONE/PARTIAL/FAILED ในเว็บที่เปิดใช้งาน สูงสุด 500 รายการต่อเว็บต่อครั้ง
- คิวเก็บใน SiteSyncJob เดิม ใช้ข้อจำกัด activeSiteId เดิม ป้องกันคิวซ้ำกับ resync ไม่ต้องเพิ่ม migration
- คิวซ่อมทำครั้งละหนึ่งวิดีโอต่อเว็บต่อ tick ตรวจสถานะก่อนส่งซ้ำ และใช้ remotePostId/aurum_movie_id เดิมผ่าน distributeToSite
- ค่าเริ่มต้น video_only รักษาเนื้อหาโพสต์เดิม การเลือก overwrite_editorial มีข้อความอธิบายว่าชื่อ เนื้อหา และ SEO บน WordPress จะถูกแทนที่
- ไม่ลบรหัสโพสต์หรือปิด identity guard ไม่เปลี่ยน FAILED เป็น SUCCESS จากการจัดคิว ต้องผ่านการตรวจปลายทางเดิม
- ต่ออายุ lease ระหว่างส่งงาน ป้องกัน worker อีกตัวรับงานเดียวกันระหว่างรอ SEO/WordPress
- ยกเลิกงานที่เหลือได้ การเขียนที่เริ่มแล้วอาจจบหนึ่งรายการก่อนหยุด เก็บ site slot จน worker จบ และคืน slot ของ cancelled worker ที่หมด lease หลัง crash
- รวมสถานะวิดีโอจากปลายทางทั้งหมดภายใต้ transaction lock ไม่ประกาศ DONE เมื่อยังมีเว็บล้มเหลว/ค้าง/ขาด Distribution
- ถ้าการตรวจสถานะในฐานข้อมูลเสียหลังโพสต์ถูกส่งแล้ว จะเก็บ checkpoint ไว้ Retry ของ failed repair รักษา checkpoint/mode และอ่านผล SUCCESS เพื่อไม่ส่งโพสต์ซ้ำ
- หน้าเว็บรีเฟรชงานที่กำลังทำจากฐานข้อมูล อ่านบันทึกเพิ่ม และแสดงความผิดพลาดในการเริ่มงานแยกต่อเว็บ

## ข้อเสนอเรื่อง push และ pull

ข้อเสนอปัจจุบันคือรักษาคิวกลางใน AURUM และค่อยย้ายการส่งงานใหม่ที่ยัง synchronous เข้าคิวด้วย การเปลี่ยนเป็น WordPress pull มีประโยชน์เมื่อเว็บไซต์ต้องควบคุมจังหวะนำเข้าเอง แต่ไม่แก้ข้อผิดพลาด SEO/credentials/REST/database โดยอัตโนมัติ หากใช้ WP-Cron อย่างเดียว งานขึ้นกับการเปิดหน้าเว็บ จึงต้องมี system cron เพื่อให้ทำงานสม่ำเสมอ: https://developer.wordpress.org/plugins/cron/

หากเลือก pull ต้องกำหนด API แบบผูก site identity, checkpoint/acknowledgement, lease, การตรวจผลจริง, นโยบายรักษาเนื้อหา และการปิด push โดยไม่สร้างสองเส้นทางที่แย่งเขียนโพสต์เดียวกัน ควรให้ AURUM สร้างเนื้อหาผ่านคิว แล้วปลั๊กอินดึง payload เพื่อไม่กระจาย AI keys ไปทุกเว็บ

การเปลี่ยนเป็น pull และการย้าย automatic publish เข้าคิวยังไม่ได้ทำในงานเพิ่มปุ่มซ่อมนี้

## การตรวจสอบและขอบเขต

- ทดสอบ queue/repair/distributor/API authorization/schema/rate limit/aggregate status/cancellation/checkpoint ด้วย Vitest ผ่าน 97 กรณีจาก 6 ไฟล์
- TypeScript และ ESLint สำหรับไฟล์ที่เปลี่ยนผ่าน
- ยังไม่ยืนยันหน้าจอจริง: เครื่องมือ Browser Use เปิด in-app browser และ Chrome ไม่สำเร็จ (attach timeout/kernel timeout)
- ยังไม่ push/deploy ไม่เริ่มซ่อมรายการจริง ไม่ได้ยืนยันว่า counters บนระบบออนไลน์ลดลงแล้ว
- หลัง deploy ต้องตรวจ MANAGER/HEAD เปิดหน้าได้ STAFF ใช้ API ไม่ได้ ตั้ง cron `/api/cron/site-sync-worker` พร้อม system key แล้วทดลองเว็บหนึ่งเว็บก่อนจัดคิวจำนวนมาก
- งานที่ชน identity, ปลายทางเข้าไม่ได้ หรือ SEO ที่ต้อง overwrite ยังต้องแก้สาเหตุ/เลือก mode ให้ถูก ไม่วน retry อัตโนมัติไม่จำกัด
