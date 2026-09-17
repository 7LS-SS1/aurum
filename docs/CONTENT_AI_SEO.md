# ชื่อและ SEO รายเว็บไซต์ — 2026-09-16

## Hotfix 2.1.1 — ผลเผยแพร่ WordPress และรายงานหลังอัปโหลด

- แก้หน้าต่างอัปโหลดที่เคยนับการบันทึกวิดีโอเข้า AURUM เป็น “สำเร็จ” แม้ WordPress ทุกเว็บล้มเหลว ตอนนี้สถานะสำเร็จต้องอิงผลเผยแพร่จริง
- หน้าสรุปแสดงเว็บไซต์ ชื่อเรื่องที่ส่งจริง สถานะ ลิงก์/เลขโพสต์ คำเตือน และ error ของแต่ละเว็บไซต์ พร้อม retry เฉพาะปลายทางที่ล้มเหลวโดยไม่อัปโหลดไฟล์เข้า storage ซ้ำ
- ตัด Keywords อัตโนมัติให้เหลือสูงสุด 15 คำแบบไม่ซ้ำก่อนเรียก OpenAI และใช้ชื่อหลักเป็น fallback เมื่อไม่มี Tag
- ตรวจ credential WordPress ก่อนค้นหา/สร้างโพสต์ พร้อมอัปเดต health status และเวลาเช็กล่าสุด จึงไม่ซ่อนปัญหา login ไว้หลัง error ตัวกรอง `status`
- ใช้ `status=any` สำหรับ recovery scan หลัง credential ผ่าน แทน CSV หลายสถานะที่เคยทำให้บางปลายทางตอบ `rest_invalid_param`
- ถ้า Rank Math Bridge ยังไม่พร้อม ระบบเผยแพร่วิดีโอและชื่อรายเว็บต่อได้ โดยข้ามเฉพาะ Rank Math meta และแสดงคำเตือนรายเว็บ
- Read-only production diagnostics ณ 2026-09-17: 17 ปลายทาง login ผ่าน 3, credential ไม่ผ่าน 13, localhost เข้าไม่ถึง 1; ทั้ง 3 เว็บที่ login ผ่านยังไม่มี SEO capability endpoint. ต้องเชื่อมต่อ credential ใหม่และติดตั้ง Bridge เพื่อให้ Rank Math meta ถูกนำเข้า
- Validation: 26 test files / 292 tests, TypeScript, ESLint และ Next.js 15.5.19 production build ผ่าน

## Release 2.1.0 — 2026-09-17

- เพิ่มการตั้งค่า OpenAI, สร้าง Title และ meta description รายเว็บไซต์โดยอิงต้นฉบับ พร้อมตรวจชื่อซ้ำและอ่าน SEO กลับจาก WordPress หลังนำเข้า
- ต้อง apply migration `20260916000000_content_ai_config` ในฐานข้อมูลของ environment ที่ deploy; Docker entrypoint ของโครงการรัน `prisma migrate deploy` อัตโนมัติ ก่อนเปิด server
- คง `ENCRYPTION_KEY` เดิมเพื่ออ่าน API key ที่เข้ารหัสไว้ และตั้งค่า model/API key ผ่าน `/admin/content-ai`
- เว็บไซต์ปลายทางต้องเปิด Rank Math และติดตั้ง `dist/aurum-rank-math-bridge-1.0.0.zip` ก่อนนำเข้าพร้อม SEO
- การ commit/push source ไม่ใช่หลักฐานว่า production deploy หรือปลั๊กอินปลายทางติดตั้งสำเร็จ
- Release validation: 26 test files / 288 tests ผ่านด้วย `npm test -- --maxWorkers=1 --minWorkers=1`; lint ผ่าน. รอบที่รันพร้อม build พบ bcrypt timeout จึงตรวจซ้ำหลัง build หยุด โดยไม่แก้ timeout หรือเงื่อนไขทดสอบ
- Production build ผ่าน (Next.js 15.5.19, compile/type validation/static generation/standalone tracing, exit 0). เครื่องนี้ Node DNS หา Google Fonts ไม่พบ จึงใช้ DNS lookup จาก Windows สำหรับสอง font hosts เฉพาะ build process ผ่าน temporary preload; ดาวน์โหลดฟอนต์จริงผ่าน HTTPS ไม่แก้ source หรือปิด TLS verification

## ปรับใช้กับหัวข้อทั่วไป — 2026-09-17

- ใช้ชื่อเรื่องร่วมกับ excerpt/content ต้นฉบับเป็นบริบท ส่งเป็นข้อความไม่เกิน 12,000 ตัวอักษรหลังตัด markup/script/style โดยไม่จำกัดหมวดเนื้อหาไว้ที่ตัวอย่างของเล่น
- Keywords ช่วยเลือกคำ ไม่ถือเป็นหลักฐานให้แต่งข้อเท็จจริงใหม่; ชื่อเว็บไซต์ใช้ระบุปลายทาง ไม่ควรนำมาเติมเพื่อทำให้ชื่อดูแตกต่าง
- ยังคงวลีชื่อหลักและตรวจชื่อซ้ำตามเดิม หากผลลัพธ์ไม่ผ่าน validation จะส่งเหตุผลให้ AI แก้ในครั้งถัดไป ภายในจำนวน retry เดิม
- ตรวจต้นฉบับอีกครั้งก่อนบันทึกร่าง ถ้าชื่อหรือบริบทที่ใช้สร้างเปลี่ยนไป จะหยุดเพื่อให้ลองใหม่จากข้อมูลล่าสุด
- Live test `scripts/check-content-ai.ts --general` สำเร็จ 3 หัวข้อ หัวข้อละ 2 เว็บไซต์: วิธีชงกาแฟดริป, จัดโต๊ะทำงานพื้นที่เล็ก, ปลูกต้นไม้บนระเบียง รวม 6 ชุด title/description ผ่าน validation และชื่อไม่ซ้ำกันภายในแต่ละหัวข้อ ไม่มีการเขียน draft/เผยแพร่โพสต์ในการทดสอบ
- Unit tests ที่เกี่ยวข้องผ่าน 20 tests. การตรวจความหมายยังอาศัย prompt และการตรวจของผู้ใช้: ผลจริงบางรายการยังมีคำขยาย เช่น “อย่างง่าย” หรือ “อย่างมีประสิทธิภาพ”; validation เชิงโครงสร้างไม่ใช่การพิสูจน์ข้อเท็จจริงทุกคำ
- การใช้ได้หลายหัวข้อไม่เปลี่ยนโควตา/ขีดจำกัดของ OpenAI และไม่ได้เพิ่มตัวสร้างบทความฉบับเต็ม ขอบเขตงานยังเป็น Title และ meta description รายเว็บ

## ทดสอบใหม่หลังเติมเครดิต — 2026-09-17

รัน `node --env-file=.env --import tsx scripts/check-content-ai.ts` ด้วย API key ที่บันทึกไว้และ `gpt-4.1-mini` สำเร็จ (exit 0) ทั้ง Models API และการสร้างผ่าน Responses API ไม่มีข้อผิดพลาดเครดิตหมดในการทดสอบรอบนี้

ชื่อหลัก: `ของเล่นมาใหม่`; Keywords: `ของเล่น`, `ของเล่นมาใหม่`

| เว็บไซต์ตัวอย่าง | Title ที่ได้จริง | Meta description ที่ได้จริง |
| --- | --- | --- |
| A | อัพเดทของเล่นมาใหม่ที่น่าสนใจในปีนี้ | ค้นพบของเล่นมาใหม่ที่น่าสนใจ พร้อมรวมไอเดียสนุกๆ สำหรับคนรักของเล่น บนเว็บไซต์ตัวอย่าง A |
| B | แนะนำของเล่นมาใหม่ที่น่าสนใจจากเว็บไซต์ตัวอย่าง B | ค้นพบของเล่นมาใหม่ที่น่าตื่นเต้น คัดสรรจากเว็บไซต์ตัวอย่าง B ที่จะทำให้คุณไม่พลาดสินค้าล่าสุดในวงการของเล่น |
| C | รู้จักของเล่นมาใหม่จากเว็บไซต์ตัวอย่าง C | พบกับของเล่นมาใหม่หลากแนวที่เว็บไซต์ตัวอย่าง C อัปเดตล่าสุดสำหรับแฟนของเล่นทุกวัย พร้อมข้อมูลครบถ้วน |

ผ่านการตรวจรูปแบบ JSON, plain text, ความยาวสูงสุด, การคงวลีชื่อหลัก, ชื่อไม่ซ้ำหลัง normalize และการมี Keyword ใน description ครบทั้ง 3 ชุด

ขอบเขตหลักฐาน: เป็นการสร้างจริงจากตัวอย่างโดยไม่บันทึก MovieSiteDraft และไม่ส่งไป WordPress จึงไม่ใช่หลักฐานทดสอบการบันทึก draft หรือเผยแพร่ production รอบใหม่ ข้อความยังมีคำขยายที่ข้อมูลนำเข้าไม่ได้ยืนยัน เช่น “ในปีนี้”, “ทุกวัย”, “ข้อมูลครบถ้วน” จึงต้องตรวจเนื้อหาก่อนใช้จริง แม้ validation เชิงโครงสร้างผ่านแล้ว

## อัปเดตแก้ปัญหาการตั้งค่า 2026-09-17

- ยืนยันว่าข้อผิดพลาดบันทึก 500 เกิดขณะ migration `20260916000000_content_ai_config` ยังไม่ถูก apply รัน migration นี้กับฐานข้อมูลที่ `.env` ชี้อยู่สำเร็จแล้ว ไม่ได้อ้างว่าเป็นคนละฐานกับ production จากชื่อ hostname
- บันทึกผ่านหน้าเว็บสำเร็จและอ่านกลับฐานข้อมูลได้: enabled=true, model=`gpt-4.1-mini`; API key ถูกเก็บเข้ารหัส ไม่มีการเปลี่ยน ENCRYPTION_KEY
- ตรวจ API key/สิทธิ์เข้าถึงโมเดลจริงผ่าน OpenAI Models API สำเร็จ
- ทดสอบสร้างข้อความตัวอย่างผ่าน Responses API จริง แต่ OpenAI ตอบ HTTP 429, code=`credit_balance_exhausted`, type=`insufficient_quota` จึงยังสร้างข้อความจริงไม่ได้ ต้องเติมเครดิต/ตรวจ billing ของ API project ที่เป็นเจ้าของคีย์นี้ ไม่ได้เผยแพร่หรือบันทึกโพสต์ทดสอบ
- แก้ missing-table ให้ตอบ 503 พร้อมขั้นตอน migration, แยกข้อผิดพลาดเครดิตหมดกับ rate limit, ปรับฟอร์มใช้สไตล์หลังบ้านและอธิบายช่อง model ID ให้ชัดเจน
- รันตรวจ live ซ้ำหลังเติมเครดิตได้ด้วย `node --env-file=.env --import tsx scripts/check-content-ai.ts` (ใช้ API เพื่อสร้างตัวอย่าง 3 เว็บไซต์ มีค่าใช้จ่ายตามการใช้งาน; ไม่เขียนโพสต์หรือ draft)
- ข้อความสถานะในส่วนหลักฐานเดิมด้านล่างเป็นผลของการส่งมอบรอบแรก ก่อนการแก้ปัญหานี้ ยังไม่ได้ deploy application/bridge ไปเว็บไซต์ production

## ตรวจพบแล้ว

- Checkout นี้ไม่มี OpenAI client หรือการตั้งค่า OpenAI เดิมใน source ที่ค้นพบ จึงเพิ่มส่วนเชื่อมต่อใหม่โดยใช้ระบบ encryption และสิทธิ์ผู้ใช้เดิม
- `MovieSiteDraft` เก็บชื่อและ extraMeta ราย `(movieId, siteId)` อยู่แล้ว ไม่ต้องเปลี่ยนชื่อหลักของ Movie
- Distributor รองรับ first import, `video_only` และ `overwrite_editorial` อยู่แล้ว
- Core ที่ bundle ใน repo เป็น 1.1.0 จึงส่ง bridge แยก ไม่แพ็ก Core รุ่นนี้ไปทับเว็บไซต์

## สิ่งที่เพิ่ม

- `/admin/content-ai` และ `GET/PUT/POST /api/content-ai`: HEAD ตั้งค่าเปิดใช้งาน, model ID และ API key ที่เข้ารหัส AES-256-GCM; GET ไม่คืน key; POST ตรวจบัญชี/โมเดลที่บันทึกผ่าน OpenAI Models API
- `/admin/videos/{id}/seo`: STAFF ขึ้นไปเลือกเว็บและ Keywords เพื่อสร้างร่าง ตรวจแก้ และบันทึกก่อนนำเข้า
- `POST /api/movies/{id}/generate-seo`: สร้างหนึ่งเว็บต่อ request; UI ทำทีละเว็บและรายงานข้อผิดพลาดแยกเว็บ
- เมื่อเปิดใช้งาน การนำเข้าวิดีโอใหม่จะสร้างร่างก่อนส่ง WordPress ใช้แท็กเป็น Keywords หากยังไม่มีร่างที่มีชื่อ ต้องมี Keywords อย่างน้อยหนึ่งคำ
- ร่างที่มีชื่อแล้ว รวมถึงชื่อที่เขียนเอง จะถูกเก็บไว้และไม่เรียก AI ซ้ำ ไม่เติม SEO ทับร่างที่บรรณาธิการเขียนไว้โดยอัตโนมัติ สามารถแก้ description ในหน้ารายเว็บได้
- ชื่อ AI ต้องคงวลีชื่อหลักเดิม ใช้ plain text และไม่ซ้ำกับชื่อหลักหรือชื่อร่างเว็บอื่นของวิดีโอเดียวกัน ตรวจซ้ำโดยตัดเครื่องหมาย ช่องว่าง และอักขระซ่อน ไม่ตรวจความซ้ำของวิดีโอคนละรายการหรือเว็บภายนอก Aurum
- ใช้ Responses API + strict JSON schema ไม่เก็บ response ฝั่ง OpenAI (`store: false`); ตรวจ refusal/incomplete/ความยาว/ชื่อซ้ำฝั่ง server และ retry ผลลัพธ์ไม่ผ่านไม่เกินสามครั้ง
- บันทึกชื่อภายใต้ PostgreSQL advisory transaction lock ต่อ movie ตรวจซ้ำหลัง AI ตอบกลับ; การแก้ชื่อ draft ใช้ lock เดียวกัน ป้องกัน concurrent write
- `rank_math_title`, `rank_math_description`, `rank_math_focus_keyword` ส่งในคำขอเดียวกับวิดีโอ ตรวจความพร้อม bridge ก่อนสร้างโพสต์และอ่านค่ากลับก่อนถือว่าสำเร็จ
- การส่งซ้ำ `video_only` ไม่เรียก AI และไม่ส่ง SEO; ความล้มเหลวอ่านกลับ SEO ต้องแก้ผ่านการส่งแบบ `overwrite_editorial` ที่มีอยู่เดิม ไม่เปลี่ยนเป็น success ด้วย video-only retry

## เปิดใช้งาน

1. สำรองฐานข้อมูลและ deploy application source พร้อม migration `20260916000000_content_ai_config` แล้วรัน `npx prisma migrate deploy` และ `npx prisma generate` ใน environment ที่ถูกต้อง
2. ติดตั้ง ZIP `dist/aurum-rank-math-bridge-1.0.0.zip` ทุกเว็บไซต์ที่ต้องรับ SEO เปิดใช้งานคู่กับ Rank Math และ AURUM Video Core รุ่นที่เว็บไซต์ใช้อยู่
3. HEAD ไปหน้า “ตั้งค่า OpenAI / SEO” ใส่ API key และ model ID ที่บัญชีใช้งานได้และรองรับ Structured Outputs เปิดใช้งาน บันทึก และทดสอบการเชื่อมต่อ
4. ไปหน้าแก้ไขวิดีโอ → “ชื่อและ SEO รายเว็บไซต์” ระบุ Keywords และสร้าง ตรวจชื่อ/description ก่อนส่งด้วย workflow เผยแพร่เดิม

หากยังไม่รัน migration ระบบนำเข้าปกติยังทำงานโดยไม่เปิด AI การบันทึกตั้งค่า AI ต้องมีตารางใหม่ก่อน

## ข้อจำกัดและหลักฐาน

- ข้อบังคับชื่อหลักช่วยคงหัวข้อ แต่ไม่ได้พิสูจน์ความหมายทุกประโยคของ AI ควรตรวจข้อความในหน้าร่าง โดยเฉพาะคำกล่าวอ้างที่ชื่อและ Keywords ไม่ได้ยืนยัน
- Keywords เป็น focus keywords ของ Rank Math ไม่ใช่การรับประกันอันดับ Google หรือคะแนน SEO
- ทดสอบ local WordPress Docker ด้วย Rank Math ที่ active: สร้าง draft ผ่าน WordPress REST dispatcher พร้อม video + SEO, authenticated read-back ครบสามฟิลด์, RankMath\Post อ่าน description ได้, video-only คง SEO และ anonymous ถูกปฏิเสธ ลบ draft ทดสอบแล้ว
- PHP lint ผ่าน; Vitest ผ่าน 25 files / 277 tests; TypeScript, ESLint, Prisma schema validation และ git diff --check ใช้ตรวจ source แยกจากผล runtime
- ยังไม่เรียก OpenAI จริงด้วย key ของผู้ใช้ ไม่ได้ทดสอบ UI ผ่าน browser ไม่ได้ migrate ฐานข้อมูลจริง ไม่ได้ติดตั้ง bridge บน production และไม่ได้ push/deploy application

อ้างอิง: [OpenAI Structured Outputs](https://developers.openai.com/api/docs/guides/structured-outputs), [Rank Math metadata](https://rankmath.com/docs/filters-and-hooks/frontend/meta-data/)

ZIP ที่ตรวจแล้ว: `D:\developer\aurum-project\dist\aurum-rank-math-bridge-1.0.0.zip` มี root เดียว `aurum-rank-math-bridge/`, bootstrap และ README รวม 2 files ไม่รวม runtime test

SHA-256: `cfc2679c395edbe2ed49b63ca9b18850ce526c1ac34f2fadac49059b5c45c66c`
