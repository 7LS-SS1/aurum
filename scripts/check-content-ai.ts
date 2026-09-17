/** Explicit live smoke test using the saved key. Generates sample copy only; never writes posts or drafts. */
import { prisma } from "../src/lib/prisma";
import { decrypt } from "../src/lib/crypto";
import { readAiConfig } from "../src/lib/content-ai";
import { generateSeo } from "../src/lib/content-seo";

async function main() {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (input, init) => {
    const result = await originalFetch(input, init);
    if (!result.ok) {
      const details = await result.clone().json().catch(() => null);
      const error = details?.error;
      console.log(JSON.stringify({
        httpStatus: result.status, contentType: result.headers.get("content-type"),
        providerCode: typeof error?.code === "string" ? error.code : null,
        providerType: typeof error?.type === "string" ? error.type : null,
        quotaMentioned: typeof error?.message === "string" && /quota|billing|credit|budget/i.test(error.message),
      }));
    }
    return result;
  };
  const config = await readAiConfig({ requireStorage: true });
  if (!config) throw new Error("content_ai_not_configured");
  const apiKey = decrypt({ ciphertext: config.apiKeyEnc, iv: config.apiKeyIv, tag: config.apiKeyTag });
  const response = await fetch(`https://api.openai.com/v1/models/${encodeURIComponent(config.model)}`, {
    headers: { Authorization: `Bearer ${apiKey}` }, redirect: "error", signal: AbortSignal.timeout(15000),
  });
  if (!response.ok) throw new Error(`openai_http_${response.status}`);
  console.log(JSON.stringify({ connection: "passed", model: config.model }));
  const general = process.argv.includes("--general");
  const subjects = general ? [
    { title: "วิธีชงกาแฟดริป", keywords: ["กาแฟดริป"], sourceContext: "วิดีโอสาธิตการชงกาแฟดริปด้วยกระดาษกรอง กาแฟบด และน้ำร้อน" },
    { title: "จัดโต๊ะทำงานพื้นที่เล็ก", keywords: ["โต๊ะทำงาน"], sourceContext: "วิดีโอแสดงการจัดวางจอ คีย์บอร์ด และสมุดบนโต๊ะทำงานพื้นที่เล็ก" },
    { title: "ปลูกต้นไม้บนระเบียง", keywords: ["ต้นไม้", "ระเบียง"], sourceContext: "วิดีโอแสดงการใส่ดินในกระถางและวางต้นไม้บนระเบียง" },
  ] : [{ title: "ของเล่นมาใหม่", keywords: ["ของเล่น", "ของเล่นมาใหม่"], sourceContext: "" }];
  for (const subject of subjects) {
    const titles: string[] = [];
    for (const site of general ? ["เว็บไซต์ตัวอย่าง A", "เว็บไซต์ตัวอย่าง B"] : ["เว็บไซต์ตัวอย่าง A", "เว็บไซต์ตัวอย่าง B", "เว็บไซต์ตัวอย่าง C"]) {
      const result = await generateSeo({ apiKey, model: config.model, ...subject, site, forbidden: titles });
      titles.push(result.title);
      console.log(JSON.stringify({ originalTitle: subject.title, site, ...result }));
    }
  }
  console.log("PASS: distinct titles and descriptions generated per subject; no content published or saved.");
}
main().catch(error => {
  // Never print upstream bodies, database URLs, config objects or keys.
  const message = error instanceof Error && /^(openai_|seo_|content_ai_)/.test(error.message) ? error.message : "content_ai_check_failed";
  console.error(message); process.exitCode = 1;
}).finally(() => prisma.$disconnect());
