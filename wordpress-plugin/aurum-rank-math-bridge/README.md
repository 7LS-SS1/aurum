# AURUM Rank Math Bridge 1.0.0

ติดตั้งร่วมกับ AURUM Video Core และ Rank Math ที่เว็บไซต์ปลายทาง ไม่ใช่ไฟล์อัปเกรดหรือทดแทน AURUM Video Core

เปิดให้ WordPress REST API รับ `rank_math_title`, `rank_math_description` และ `rank_math_focus_keyword` ใน `meta` ของคำขอสร้างวิดีโอเดียวกัน ใช้ Application Password/JWT เดิมของเว็บไซต์ ผู้ใช้ต้องมีสิทธิ์แก้โพสต์นั้น

ตรวจความพร้อมโดยเรียก `GET /wp-json/aurum-video-core/v1/seo-capabilities` แบบยืนยันตัวตน ค่า `postTypes` ต้องมี REST base ที่ตั้งใน Aurum เช่น `posts` และ `rankMathActive` ต้องเป็น `true`

ไม่สร้างค่า SEO ให้อัตโนมัติ ไม่แก้ SEO ของโพสต์เก่า ไม่แก้ canonical/robots และไม่กำหนดคะแนน SEO Rank Math จะอ่านค่าจาก post meta ตามปกติ หาก Rank Math สร้าง VideoObject อยู่แล้ว bridge จะปิด VideoObject แยกของ AURUM Core ใน request นั้น

การปิดปลั๊กอินไม่ลบ metadata ที่บันทึกไว้

เอกสาร Rank Math: https://rankmath.com/docs/filters-and-hooks/frontend/meta-data/

การทดสอบในเครื่อง: `tests/runtime.php` เรียก WordPress REST ภายใน PHP ด้วย admin ทดสอบ สร้าง draft ชั่วคราว ตรวจ read-back และลบทิ้งใน finally ไม่ใช่การทดสอบ HTTP Application Password หรือ production
