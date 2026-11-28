# ระบบสแกนแหล่งวิดีโอ AURUM

ระบบอ่าน catalog ที่องค์กรเป็นเจ้าของหรือมีสัญญาอนุญาต ดาวน์โหลดสื่อเข้า R2 ตรวจไฟล์ด้วย ffprobe และสร้าง Movie สถานะ `READY_FOR_REVIEW` เท่านั้น ไม่มีการอนุมัติหรือเผยแพร่อัตโนมัติ และไม่มีระบบ `workers/download/minor-terms.cjs` ตามขอบเขตที่แก้ไขแล้ว

## เตรียมระบบ

1. ติดตั้ง dependency ด้วย `npm ci` และสร้าง Prisma client ด้วย `npm run db:generate` จากนั้นเริ่ม process แอปใหม่เพื่อโหลด models ที่เพิ่ม บน Windows ถ้า query engine ถูก dev server ล็อก ให้หยุด dev server ก่อน generate แล้วเปิดใหม่
2. ใช้ `npm run db:migrate:deploy` กับฐานทดสอบก่อนนำขึ้นระบบจริง ตามลำดับ `20261127000000_auto_download` และ `20261127010000_video_source_scanner` ซึ่งรวมตาราง scanner โหมดอัตโนมัติ และสถานะ Worker
3. เครื่องที่รัน Next.js ต้องมี `ffmpeg` และ `ffprobe` ใน PATH หรือกำหนด `FFMPEG_PATH`, `FFPROBE_PATH` เป็น executable path จริง Docker runtime ติดตั้ง ffmpeg ให้แล้ว
4. ใช้ค่าการเชื่อมต่อ R2 เดิม: `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET_NAME`, `R2_PUBLIC_HOSTNAME`
5. กำหนด `SOURCE_SCANNER_CONTACT_URL=https://your-domain.example/contact` หรือ `PUBLIC_APP_ORIGIN` เพื่อระบุตัวตน `AURUM-Scanner/1.0 (+contact URL)` เมื่อไม่ได้ตั้งค่า Worker จะส่ง User-Agent `AURUM-Scanner/1.0`
6. เผื่อพื้นที่ temporary disk อย่างน้อยประมาณสองเท่าของขนาดไฟล์สูงสุดบวกภาพปก ระหว่าง HLS remux จะมีทั้ง segments และไฟล์ผลลัพธ์

## การใช้งาน

- เปิด `/admin/video-sources` จากเมนูเนื้อหาเพื่อดูความคืบหน้า สถานะ Worker พื้นที่ดิสก์ชั่วคราว ตัวเลขงาน และรายการ Tasks ที่ค้นหาและกรองได้ STAFF ดูรายการได้ ส่วน MANAGER/HEAD เพิ่ม แก้ไข ทดสอบ เริ่ม พัก หยุด ลองใหม่ และลบแหล่งได้
- กด **เพิ่ม Task เว็บไซต์** แล้วกรอกชื่อ, URL หน้าแรก และหมวดหมู่หลัก โหมดอัตโนมัติเป็นค่าเริ่มต้นและอ่านลิงก์บทความ/วิดีโอ ตัวเล่น HTML และเครื่องหมายแบ่งหน้าที่รองรับได้โดยไม่ต้องเขียน recipe
- ระบบรวมโฮสต์ของ URL แรกใน allowedHosts อัตโนมัติ หาก media, iframe, ปก, HLS segment หรือ redirect ใช้โดเมนอื่น ให้ระบุชื่อโฮสต์ตรงตัวใน **การตั้งค่าเพิ่มเติม**
- แหล่งใหม่เริ่มที่ `STOP` ใช้ **ทดสอบต้นทาง** เพื่อดูสูงสุด 10 ลิงก์และ media URL รายการแรก โดยไม่ดาวน์โหลดไฟล์วิดีโอ ไม่สร้างคิวหรือ Movie
- กด **เริ่ม** เพื่อเปิด Task แล้วกด **สแกนและดาวน์โหลดตอนนี้** ที่หน้ารายละเอียดเพื่อประมวลผลหนึ่งรอบ หรือให้ scheduler ทำงานต่อเนื่อง
- **พัก** ไม่เริ่มหน้า/รายการใหม่ แต่ให้งานที่กำลังทำจบ **หยุด** ยกเลิกงานปัจจุบันภายในรอบ polling ประมาณ 1 วินาที คืนงานเป็น PENDING และลบ temporary files/objects ของความพยายามนั้น เมื่อเริ่มใหม่จะดาวน์โหลดใหม่ ไม่ resume partial bytes
- หาก Task ค้างที่ `PAGINATION_UNPROVEN` ให้กด **หยุด** แล้วกด **เริ่ม** เพื่อคืนหน้าที่ค้างจากข้อผิดพลาดนี้เข้าคิว ระบบเก็บหน้าที่สแกนสำเร็จและรายการวิดีโอที่พบไว้
- ต้องหยุดก่อนแก้แหล่ง การบันทึกเพิ่ม recipeVersion และเริ่ม traversal ใหม่ รายการที่ค้นพบแล้วยัง deduplicate ด้วย externalId วิดีโอที่สร้างแล้วไม่ถูกสร้างซ้ำ
- ลบแหล่งเป็น soft delete พร้อม STOP วิดีโอที่สร้างไปแล้วคงอยู่
- หน้ารายละเอียดแสดงรายการ/จำนวนไบต์ที่ดาวน์โหลด/attempts, หน้าที่สแกน, log ล่าสุด 1,000 เหตุการณ์ และลิงก์ไปวิดีโอ มี pagination; ขณะทำงาน refresh ทุก 5 วินาที
- `/admin/review?source=scan` แสดงผลลัพธ์จาก scanner แยกจากการเพิ่มเอง/API/คิวดาวน์โหลดเดิม

## Worker และ scheduler

```sh
SERVICE_WORKER_ORIGIN=https://management.example.com
SERVICE_WORKER_SECRET=<same-secret-as-service-worker>
npm run scanner:worker
```

สคริปต์อ่านค่าจาก environment ของ process ไม่โหลด `.env` เอง รองรับ `SERVICE_WORKER_SECRET_FILE` แบบ absolute path เช่นเดียวกับ worker เดิม ห้ามใส่ secret ลง command line/log

ตั้ง scheduler เรียกทุก 1 นาทีหรือช่วงที่เหมาะกับปริมาณงาน สคริปต์ทำงานครั้งเดียวแล้วจบ โดย POST `/api/internal/source-scanner` ด้วย Bearer secret รอบหนึ่งมีงบ 270 วินาที (กันเวลาทำงาน 260 วินาทีและเวลา cleanup) เลือกได้สูงสุด 20 แหล่งตามเวลาที่แหล่งได้รับการประมวลผล/อัปเดตล่าสุด สแกนหน้าตาม maxPagesPerRun และดาวน์โหลดหนึ่งรายการต่อแหล่งตามลำดับ

ใช้ global database lease ร่วมระหว่าง worker กับ recipe test จึงไม่ยิงงานพร้อมกันข้าม replica/host ถ้ามีรอบค้างอยู่จะตอบ `409 BUSY` และให้ scheduler ลองรอบถัดไป ไม่ควรเพิ่ม parallel workers เพื่อเร่ง throughput

Page/Item claim ใช้ `updateMany` พร้อมสถานะและ updatedAt และมี claimToken ป้องกัน worker เก่าบันทึกทับ งานค้างเกิน 30 นาทีคืนคิว โดย attempts ไม่เกิน 3 ครั้ง ลองอัตโนมัติหลัง 30/60 วินาที ก่อนล้มเหลวครั้งที่สาม การหยุดด้วยผู้ดูแลไม่กิน attempt เพิ่ม

หากยังมีหน้าถัดไปเมื่อถึง maxPagesPerRun รอบถัดไปทำต่อจากหน้าที่ค้าง เมื่อยืนยัน terminal ครบจึงตั้งเวลาสแกนรอบใหม่ตาม scanIntervalMinutes ค่า 0 สแกน catalog รอบเดียวและดาวน์โหลดรายการที่เหลือจนหมด หากโหมดอัตโนมัติพบวิดีโอแต่ยังยืนยันหน้าถัดไปหรือหน้าสุดท้ายไม่ได้ ระบบจะเก็บรายการที่พบและแสดงสถานะ **สแกนยังไม่ครบ** รายการที่ดาวน์โหลดแล้วจะไม่สร้างซ้ำเมื่อเริ่ม traversal ใหม่หลังบันทึกการตั้งค่า

Worker รายงานพื้นที่ดิสก์ของโฟลเดอร์ชั่วคราวเมื่อ scheduler เรียก ระบบแสดงว่าออนไลน์ถ้าได้รับรายงานภายใน 6 นาที


## ตัวอย่าง HTML recipe

```json
{
  "videoLinks": "a.video-link",
  "next": "a[rel=next]",
  "terminal": "[data-last-page=true]",
  "title": "h1",
  "description": ".description",
  "media": "video, a.download",
  "iframe": "iframe.player",
  "cover": "meta[property='og:image']",
  "tags": ".tags a",
  "categories": ".categories a",
  "ads": ".ad"
}
```

ใช้ CSS selectors ของ Cheerio ตรวจความถูกต้องตอนบันทึก ลบ element ที่ ads ชี้ก่อนเลือก media รองรับ src/href และ `<source>` ภายใน video, ภาพปก src หรือ meta content อ่าน iframe ไม่เกิน 3 ชั้น ไม่รัน JavaScript ไม่แกะสคริปต์ป้องกัน

terminal ต้องเป็น element ที่มีเฉพาะหน้าสุดท้าย ไม่ควรใช้ body หรือ selector ที่พบทุกหน้า หน้าว่างไม่ยืนยันว่าจบ next และ terminal ที่พบพร้อมกันเป็นข้อมูลขัดแย้ง ลิงก์ next วนหน้าที่พบแล้วเป็น PAGINATION_LOOP

## ตัวอย่าง JSON catalog recipe

เลือก **JSON catalog มาตรฐาน** เพื่ออ่านรูปแบบ 7m-storage โดยตรง ค่า `next` เป็น array ของ URL และ `terminal` เป็น boolean แต่ละรายการระบุ `id`, `title`, `mediaUrl`, `mainContent: true` และเลือกใส่ `sourceUrl`, `coverUrl`, `description`, `tags`, `categories` ได้ เลือก **JSON ที่กำหนดตำแหน่งข้อมูลเอง** เมื่อโครงสร้างต้นทางต่างจากรูปแบบนี้

```json
{
  "items": "data.items",
  "id": "id",
  "pageUrl": "pageUrl",
  "title": "title",
  "description": "description",
  "mediaUrl": "mediaUrl",
  "coverUrl": "coverUrl",
  "tags": "tags",
  "categories": "categories",
  "next": "pagination.next",
  "terminal": "pagination.terminal"
}
```

items/next/terminal อ้างจาก root; field อื่นอ้างจากแต่ละ item ใช้ dot paths เท่านั้น ไม่มี expression/code terminal ต้องเป็น boolean true, next ต้องเป็น URL หรือ null, tags/categories เป็น array ของชื่อ, id ต้องคงที่ ตัวอย่างโครงสร้าง:

```json
{
  "data": { "items": [{ "id": "v1", "pageUrl": "https://catalog.example/video/1", "title": "ตัวอย่าง", "mediaUrl": "https://cdn.example/1.mp4", "tags": [], "categories": [] }] },
  "pagination": { "next": null, "terminal": true }
}
```

## สื่อและเครือข่าย

- MP4 และ WebM เก็บเป็นนามสกุลเดิม (`videos/scan/<sourceId>/<itemId>.mp4` หรือ `.webm`) เพื่อไม่บังคับแปลง codec ส่วน HLS VOD ไม่เข้ารหัส remux เป็น MP4
- HLS ที่มีหลาย variants ต้องระบุ media playlist ให้ตรง มิฉะนั้น AMBIGUOUS_MEDIA; ไม่รองรับ live, encrypted/DRM, alternate audio renditions และ byte-range playlists
- HLS segments/initialization map ทั้งหมดถูกดาวน์โหลดผ่านนโยบาย URL/robots/rate limit แล้วเขียน playlist ที่อ้างไฟล์ใน temporary directory ก่อนส่งให้ ffmpeg ซึ่งเปิดได้เฉพาะ protocol `file` ไม่มีการให้ ffmpeg เรียก network เอง
- ffprobe ต้องพบ video stream และ duration > 0 ก่อน upload ถ้ามีปกต้นทางจะตรวจและแปลง JPEG ด้วย sharp มิฉะนั้นสร้างจากเฟรมวิดีโอ
- ใช้ multipart uploader เดิมและ abort signal; Movie, item DONE และ audit ถูกบันทึกใน transaction เดียว มี stopVersion และ lease fence ป้องกัน STOP/RUN ที่เกิดเร็วระหว่างทำงาน
- SSRF guard ตรวจทุก DNS answer และทุก redirect และ pin DNS ที่ตรวจแล้วเข้ากับ socket ปฏิเสธ IP ภายใน/mapped/transition IPs ใช้ HTTPS port 443 เท่านั้น
- อ่าน robots.txt และจำกัดอย่างน้อย 1 วินาที/host รวม robots, pages, images และ HLS segments เคารพ crawl-delay; robots 404/410 หมายถึงไม่มี rules ส่วน 403/429/5xx ไม่ถือว่าได้รับอนุญาต เมื่อพบ 429 จะอ่าน Retry-After และเก็บ host cooldown ใน scanner_leases เพื่อให้ทุกแหล่งและ worker รอบถัดไปรอด้วย
- ไม่ส่ง credentials/login cookies ไม่หลบ DRM/paywall/login/captcha/rate limits ไม่ deobfuscate URL ข้อผิดพลาดเป็นข้อความคงที่ภาษาไทย URL ที่แสดงในรายการ/ผลทดสอบซ่อน query string
- หาก R2 cleanup ล้มเหลว หรือ DB ติดต่อไม่ได้หลังส่ง transaction อาจมี object ค้าง ใช้ source/item IDs ตรวจเทียบก่อนลบ ห้ามลบ object ที่ Movie อ้างอยู่ การ retry ใช้ key เดิม; ไม่มีการลบวิดีโอที่สำเร็จแล้ว

## API

| Endpoint | บทบาท | หน้าที่ |
| --- | --- | --- |
| GET /api/video-sources | STAFF+ | รายการพร้อม counters (`page`, `take` สูงสุด 100) |
| POST /api/video-sources | MANAGER+ | เพิ่มแหล่ง |
| GET /api/video-sources/[id] | STAFF+ | รายละเอียด, pages แบบแบ่งหน้า, log 1,000 ล่าสุด |
| PATCH /api/video-sources/[id] | MANAGER+ | แก้ข้อมูลเต็มรูปแบบหลัง STOP |
| DELETE /api/video-sources/[id] | MANAGER+ | STOP และ soft delete |
| POST /api/video-sources/[id]/control | MANAGER+ | `{ "action": "RUN" / "PAUSE" / "STOP" }` |
| POST /api/video-sources/[id]/test | MANAGER+ | ทดสอบค่าที่บันทึก หรือส่ง form เต็มเพื่อทดสอบ draft; แหล่งใหม่ใช้ id `draft` |
| GET /api/video-sources/[id]/items | STAFF+ | `state`, `page`, `take` |
| POST /api/video-sources/[id]/items/[itemId]/retry | MANAGER+ | FAILED/UNSUPPORTED กลับเป็น PENDING, reset attempts พร้อม audit |
| POST /api/internal/source-scanner | Worker secret | ประมวลผลหนึ่งรอบ |

## Error codes

| Code | ความหมาย / การแก้ไข |
| --- | --- |
| INVALID_URL / PRIVATE_ADDRESS | ตรวจ HTTPS/allowedHosts และปลายทาง DNS |
| ROBOTS_DENIED / ROBOTS_UNAVAILABLE | เจ้าของแหล่งต้องอนุญาต crawling หรือแก้ robots.txt |
| RATE_LIMITED / SOURCE_HTTP | ต้นทางจำกัด/ปฏิเสธคำขอ รอหรือแก้การอนุญาตที่ต้นทาง |
| INVALID_RECIPE | แก้ selector, dot path หรือชนิดข้อมูล |
| AUTO_LINKS_NOT_FOUND | ไม่พบโครงสร้างรายการมาตรฐาน ให้ตรวจ URL หรือระบุ HTML recipe |
| PAGINATION_UNPROVEN / PAGINATION_LOOP | แก้ next/terminal ให้ชี้หลักฐานจริง |
| AMBIGUOUS_MEDIA | พบหลายสื่อ/variant เลือก recipe หรือ media playlist ให้ชัดเจน |
| UNSUPPORTED_PLAYER | ไม่มีสื่อมาตรฐานที่รองรับ หรือเข้ารหัส/รูปแบบ HLS ไม่รองรับ |
| ITEM_LIMIT / TOO_LARGE | ตรวจ maxItemsTotal, maxFileBytes และขนาดหน้า/ปก |
| INVALID_MEDIA / MEDIA_TOOL | ตรวจไฟล์, duration, codec และ ffmpeg/ffprobe |
| STOPPED / TIMEOUT | คืนคิว; STOP ไม่กิน attempts ส่วน timeout ใช้ retry/backoff |
| BUSY | มี worker/test ถือ lease รอรอบถัดไป |
| INTERNAL | ตรวจ DB/R2/contact URL/configuration; ไม่แสดงรายละเอียด secret |

## การตรวจสอบและข้อจำกัดการส่งมอบ

```sh
npm run typecheck
npm test
npx vitest run src/lib/source-scanner src/lib/safe-http.test.ts src/lib/auto-download.test.ts
```

เทสต์ใช้ HTML fixture ใน repo และ mock transport/DB/R2 ไม่มีการเรียกเว็บไซต์จริง เทสต์ media สร้างวิดีโอสีพื้นและตรวจ MP4/WebM/HLS/ภาพปกด้วย ffmpeg/ffprobe จริง หากไม่มี executable ชุด media จะถูก skip

migration ชุดรวมถูกใช้กับฐาน Prisma Postgres ที่ Next.js ในเครื่องเชื่อมอยู่แล้ว

ผลตรวจในเครื่องวันที่ 27 พฤศจิกายน 2026:

- `npm run typecheck`: ผ่าน
- `npm test`: 701 ผ่าน, 1 skip (108 test files)
- ESLint เฉพาะโค้ดที่แก้, `prisma validate`, `git diff --check` ผ่าน และ SQL จาก `prisma migrate diff` ตรงกับ migration ที่เพิ่ม
- ตรวจหน้ารายการและป๊อปอัปเพิ่ม Task ที่ 390px/1440px ด้วย API fixture ส่งฟอร์มโหมดอัตโนมัติแบบสแกนรอบเดียวได้โดยไม่ต้องระบุ recipe
- ยังไม่ได้ซ้อม migration บน PostgreSQL แยก เพราะ Docker daemon เครื่องนี้ไม่ได้ทำงาน และไม่ได้รัน production build

เอกสารอ้างอิง: [Cheerio selectors](https://cheerio.js.org/docs/basics/selecting/), [FFmpeg protocol whitelist](https://ffmpeg.org/ffmpeg-protocols.html), [Robots Exclusion Protocol RFC 9309](https://www.rfc-editor.org/rfc/rfc9309.html)
