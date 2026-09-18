# AURUM Video Core 1.3.0 — แผนดำเนินการ

ผู้ใช้อนุญาตให้วางแผนและดำเนินการจนเสร็จเมื่อ 17 กันยายน 2026
ขอบเขตเป็น source local, integration tests และ ZIP ติดตั้ง ไม่มี production deployment

## ตรวจพบแล้ว

- Project AURUM มีคิวงานหลายเว็บและ identity guards อยู่แล้ว
- Core 1.2.4 รับ metadata/นักแสดง, player, editor persistence และ SEO
- Core ยังไม่มีหน้าจัดการเว็บไซต์/วิดีโอ/CSV และโปรไฟล์ชนิดโพสต์
- 7M มี profile และ CSV snapshots แต่ namespace/identity ของทั้งสองระบบต่างกัน
- ธีม 8 ตัวรองรับ Core แล้ว ต้องรักษาการเชื่อมต่อและ URL เดิม

## การดำเนินการที่อนุมัติ

1. เพิ่ม site profile auto/posts/video; auto รักษาการลงทะเบียนที่มีอยู่
   สร้าง video CPT เฉพาะเลือก video และไม่มีเจ้าของเดิม ไม่เปลี่ยน rewrite ที่มีอยู่
   ส่ง post/taxonomy REST bases ที่ใช้จริงผ่าน diagnostics
2. เพิ่ม wp-admin: ภาพรวมความพร้อม, รายการวิดีโอ, โปรไฟล์, ประวัติ และ CSV
   ใช้ manage_options/nonce สำหรับหน้าระบบและ edit_post สำหรับข้อมูลแต่ละรายการ
3. เพิ่ม REST audit แบบจำกัดจำนวน เก็บเฉพาะรหัสโพสต์/รหัสวิดีโอ/ชื่อฟิลด์
   ไม่เก็บ credential หรือ media URL ที่มี token; ไม่อ้างว่าเป็นสถานะคิวส่วนกลาง
4. CSV export/preview/apply: อัปเดตโพสต์เดิมเท่านั้น ผูก site/blog/post/movie ID
   เก็บ snapshots ตรวจ conflict ทั้งหลัง Export และหลัง Preview
   จำกัดขนาดไฟล์/จำนวนแถว; omitted columns รักษาค่า; explicit blank ล้างค่า
   meta_description อัปเดต Rank Math description และ post_content
   รองรับ title, excerpt, keywords, categories/tags/actors พร้อม rollback รายแถว
   ลิงก์วิดีโอและตัวตนไม่อยู่ใน editable columns
5. Project AURUM อ่าน diagnostics เพื่อแสดงความพร้อมและตรวจ REST profile
   ไม่เปลี่ยน target site settings อัตโนมัติ ไม่เพิ่มระบบดึงข้อมูลแข่งกับคิวส่งงาน
6. ทดสอบ security/conflict/rollback/REST/profile/admin/theme regression
   ทำ source parity กับ wordpress-plugin ใน Project และสร้าง ZIP/checksum

## สิ่งที่ยังต้องแยกจากผลทดสอบ local

production migrations, live credentials, deployed queue workers, browser playback,
provider iframe, CDN และ Search Console ไม่ได้ยืนยันจาก source/local tests

## สถานะส่งมอบ 18 กันยายน 2026

ข้อ 1–6 ดำเนินการแล้วและตรวจ local runtime/HTTP/browser พร้อม cleanup
ผลละเอียดและ ZIP/checksum อยู่ใน D:\developer\wp-docker\AURUM-VIDEO-CORE-1.3.0.md
การเปลี่ยน source ของ Project ยังต้องนำขึ้น production แยกต่างหาก
