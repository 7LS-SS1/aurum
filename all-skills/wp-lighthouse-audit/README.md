# wp-lighthouse-audit (Windows)

Lighthouse performance audit + fix-mapping สำหรับ WordPress site (Hello Elementor / Astra + Elementor Pro + LiteSpeed Cache + Cloudflare บน Apache host)

## ไฟล์ใน zip นี้

| File | Purpose |
|---|---|
| `SKILL.md` | Workflow ฉบับเต็ม + Gotchas G1-G14 + Fix mapping (ใช้กับ Claude/AI หรืออ่านเองก็ได้) |
| `audit.ps1` | PowerShell script รัน Lighthouse median-of-N สำหรับ mobile + desktop |
| `README.md` | ไฟล์นี้ |

## 2 วิธีใช้

### A) ใช้กับ Claude Code (Recommended ถ้ามี)

```powershell
# Copy ทั้งโฟลเดอร์ไปที่ skills directory
Copy-Item -Recurse .\wp-lighthouse-audit "$env:USERPROFILE\.claude\skills\"
```

จากนั้นใน Claude Code พิมพ์: `/wp-lighthouse-audit` หรือพูดธรรมชาติ เช่น
- "เช็ค pagespeed ของ example.com"
- "ทำไมเว็บนี้ช้า https://site.com/"
- "LCP สูง optimize ยังไง"

Claude จะ trigger skill นี้อัตโนมัติ + รัน workflow ให้

### B) ใช้ standalone (ไม่มี Claude Code)

```powershell
# Quick start — รัน audit เลย
.\audit.ps1 -Url "https://site.com/" -Tag "before"

# Parse ผล (Python หรือ Node — ดู SKILL.md Stage 3)
```

อ่าน `SKILL.md` เพื่อ:
- เข้าใจว่า score แย่ เพราะอะไร (5 root cause patterns)
- รู้ว่าต้องไป flip ตรงไหนใน LSCache/Elementor admin (fix-mapping table)
- ระวัง gotcha 14 ข้อที่เคยทำพังจริง

## Prerequisites

| Tool | Check |
|---|---|
| Chrome | `Test-Path "$env:ProgramFiles\Google\Chrome\Application\chrome.exe"` |
| Node 18+ | `node --version` |
| Python 3 *(optional, parse only)* | `py --version` |
| curl | `curl.exe --version` (built-in Windows 10/11) |

> **อย่าใช้ VPN/WARP** ตอน audit — routing เพี้ยน ผลไม่ตรง

## Heads up (Windows specifics)

- ใช้ `curl.exe` ตลอด ไม่ใช่ `curl` (PowerShell alias ของ Invoke-WebRequest — syntax คนละแบบ)
- ถ้า PowerShell บล็อก script: `Set-ExecutionPolicy -Scope CurrentUser RemoteSigned` (ไม่ต้อง admin)
- Output ไปที่ `$env:TEMP\lh-<tag>\` (= `C:\Users\<you>\AppData\Local\Temp\lh-<tag>\`)

## Workflow สรุปสั้น

```
1. PSI API ลองก่อน (curl) — เร็วกว่า ถ้า quota เหลือ
2. ถ้าหมด quota → audit.ps1 รัน lighthouse local
3. Parse JSON → หา 5 insights หลัก (image-delivery, lcp-discovery, render-blocking, cache, third-party)
4. Map insight → action ใน LSCache/Elementor admin (ดูตาราง fix-mapping)
5. wp litespeed-purge all + CF cache purge
6. Re-audit → compare median 3 runs
```

อ่านรายละเอียดเต็มใน `SKILL.md`
