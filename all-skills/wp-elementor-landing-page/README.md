# WP Elementor Landing Page

คู่มืออ่านเร็วสำหรับโปรเจกต์/สกิล `wp-elementor-landing-page` ใน workspace นี้ ใช้เพื่อให้ Codex หรือคนที่มาทำงานต่อเข้าใจว่า งานนี้คือการสร้าง/แก้ไขหน้า Landing Page บน WordPress ด้วย Elementor จริง ไม่ใช่การทำ HTML mockup แยกไว้ใน `web-build/`

## เป้าหมายของโปรเจกต์

- สร้างหรือปรับหน้า Landing Page บน WordPress/Elementor ให้ใช้งานได้จริงบนเว็บ LocalWP
- ใช้ WP-CLI เป็นหลักในการติดตั้งปลั๊กอิน สร้างหน้า อัปเดต Elementor metadata นำเข้ารูป และ flush cache/CSS
- รองรับงานภาษาไทย โดยต้องระวัง encoding และตรวจผลจริงใน browser
- ตรวจ responsive, ภาพ, สี, layout, overflow และข้อความไทยก่อนส่งงาน

## ไฟล์สำคัญ

- `SKILL.md` - คำสั่งหลักของสกิล ใช้เป็น source of truth ว่าควรทำงานอย่างไร
- `references/localwp-elementor.md` - รายละเอียด LocalWP, path, WP-CLI pattern, media import, Elementor metadata และ browser validation
- `agents/openai.yaml` - metadata สำหรับแสดงชื่อ/คำอธิบายของสกิลใน UI

## สภาพแวดล้อมที่ใช้บ่อย

- WordPress URL: `http://test1.local/`
- WP root: `D:\xampp\htdocs\localwp\test1\app\public`
- Workspace: `D:\xampp\htdocs\codex`
- Local plugin zip folder: `D:\xampp\htdocs\codex\plag-in`
- Elementor Pro zip ที่เคยใช้: `D:\xampp\htdocs\codex\plag-in\elementor-pro_4.0.4_nf.zip`

ก่อนทำงานจริงให้อ่าน `references/localwp-elementor.md` เสมอ เพราะมี command pattern ที่ LocalWP ต้องใช้กับ PHP/MySQL extensions เฉพาะเครื่องนี้

## Workflow มาตรฐาน

1. ยืนยัน URL และ path ของ WordPress เป้าหมาย
2. ตรวจหรือติดตั้ง `elementor` และ Elementor Pro ถ้าจำเป็น
3. สร้างหรืออัปเดต WordPress page ผ่าน WP-CLI
4. เขียน Elementor layout ลง `_elementor_data` พร้อม meta ที่จำเป็น เช่น `_elementor_edit_mode`, `_elementor_version`, `_wp_page_template`
5. นำเข้ารูปเข้า Media Library ก่อนใช้งานใน widget หรือ CSS
6. ใส่ CSS ผ่าน WordPress Additional CSS เมื่อเป็นงานดีไซน์หรือ page-specific styling
7. Flush Elementor CSS และ WordPress cache หลังแก้ข้อมูล
8. เปิดตรวจด้วย browser/Playwright ทั้ง desktop และ mobile
9. รายงาน URL, สิ่งที่แก้, และผล validation ที่ผ่าน

## หลักการทำ Elementor

- ต้องทำเป็นหน้า WordPress/Elementor จริง ไม่ส่งแค่ไฟล์ HTML แยก
- ใช้ custom class ที่ stable เช่น `wc26-hero`, `wc26-card`, `section-a` เพื่อแก้ CSS ภายหลังง่าย
- สำหรับ Elementor JSON ให้ใช้ PHP array แล้ว encode ด้วย `wp_json_encode()` และ `wp_slash()` เพื่อลดปัญหา escaping
- ถ้า PowerShell quoting เริ่มยุ่ง ให้สร้างไฟล์ PHP ชั่วคราวแล้วรันผ่าน `wp eval-file`
- อย่าแก้ข้อความไทยแบบ blind replacement จาก terminal ถ้าเห็น mojibake ให้ตรวจ DOM/browser ก่อน

## Visual และ UX Checklist

- First viewport ต้องสื่อทันทีว่าหน้านี้เกี่ยวกับอะไร
- Landing page ต้องมี visual asset จริง เช่น ภาพสนาม กีฬา คนดู ถ้วย หรือภาพสินค้าที่เกี่ยวข้อง
- ฟอนต์และสีต้องอ่านภาษาไทยชัด
- CTA ต้องเด่นพอและไม่ทับกับเนื้อหา
- Mobile ต้องไม่มี horizontal overflow
- รูปภาพต้องโหลดจริง มี `naturalWidth` และ `naturalHeight` มากกว่า 0
- ถ้าใช้ background image เดียวหลาย section ให้ใส่ที่ parent/body แล้วทำ section ให้ transparent เพื่อเลี่ยงภาพเป็นแถบซ้ำ

## Validation ที่ควรทำ

- หน้าโหลดได้ HTTP 200
- Elementor layout แสดงบน public page
- ไม่มีข้อความไทยเพี้ยนที่เห็นได้ใน browser
- ไม่มี horizontal overflow: `document.documentElement.scrollWidth <= window.innerWidth + 1`
- รูปภาพไม่ broken
- ตรวจ computed style สำหรับสี/background ที่ผู้ใช้เจาะจง
- บันทึก screenshot desktop/mobile เมื่องานเป็น visual deliverable

## ข้อควรระวัง

- อย่าลบหรือเขียนทับเนื้อหา/SEO/CTA เดิมโดยไม่จำเป็น
- อย่าส่งงานโดยดูจาก code อย่างเดียว ต้องตรวจ browser
- อย่าทำ static mockup แทน Elementor ถ้าผู้ใช้ขอ WordPress/Elementor
- ระวัง Elementor generated CSS override สีและ spacing อาจต้องตรวจด้วย `getComputedStyle`
- ระวัง LocalWP proxy/network เวลาใช้ `curl` หรือ Playwright กับ `test1.local`

## อ่านต่อ

รายละเอียด command และตัวอย่างโค้ดอยู่ที่:

```text
references/localwp-elementor.md
```

ถ้างานเริ่มจากศูนย์ ให้อ่าน `SKILL.md` ก่อน แล้วอ่าน reference นี้ต่อเพื่อใช้ command ที่ถูกกับเครื่องนี้
