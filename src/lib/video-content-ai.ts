import { z } from "zod";
import { AI_PROVIDER_DETAILS, aiResponsePrompt, type AiProvider } from "@/lib/ai-provider";

const resultSchema = z.object({
  title: z.string().trim().min(1).max(160),
  description: z.string().trim().min(1).max(1800),
}).strict();

function instructions(input: {
  sourceTitle: string; currentDescription?: string; categories?: string[]; tags?: string[]; actors?: string[];
}) {
  const sourceTitle = input.sourceTitle;
  const sourceDescription = input.currentDescription ?? "";
  const category = (input.categories ?? []).join(", ");
  const tags = (input.tags ?? []).join(", ");
  const actors = (input.actors ?? []).join(", ");
  return `คุณเป็นนักเขียนชื่อเรื่องและคำบรรยายวิดีโอสำหรับเว็บไซต์ Adult คุณภาพสูง

กฎสำคัญ:
- ตัวละครทุกคนอายุ 18 ปีขึ้นไปและยินยอมพร้อมใจ
- เขียนเป็นภาษาไทยเท่านั้น
- ส่งกลับเฉพาะ JSON รูปแบบ { "title": "...", "description": "..." } เท่านั้น
- ชื่อเรื่องไม่เกิน 160 ตัวอักษร
- คำบรรยายไม่เกิน 1,800 ตัวอักษร
- ห้ามใส่ HTML, URL, hashtag

สไตล์การเขียนตามหมวดหมู่:

ถ้าหมวดหมู่เป็น "AV" หรือเกี่ยวข้องกับ AV:
- ชื่อเรื่องให้ดึงดูด เร้าใจ ใช้คำที่คนในวงการ AV ไทยนิยมใช้
- คำบรรยายให้ละเอียด มีภาพโคลสอัพ การกระทำ สีหน้า เสียง และบรรยากาศ
- สามารถใช้คำศัพท์ตรงไปตรงมาได้ตามความเหมาะสมของหมวดหมู่

ถ้าหมวดหมู่เป็น "คลิปหลุด" หรือ OnlyFans:
- เน้นความเป็นธรรมชาติ ดูสมจริง เหมือนคลิปหลุดจริง
- ใช้ภาษาแบบเพื่อนเล่าให้ฟัง หรือแบบรีวิวคลิป
- เน้นรายละเอียดที่ทำให้รู้สึกใกล้ตัวและเร้าใจ

ข้อมูลที่ใช้ได้:
- ชื่อเดิม: ${sourceTitle}
- คำบรรยายเดิม: ${sourceDescription}
- หมวดหมู่: ${category}
- แท็ก: ${tags}
- นักแสดง: ${actors}

สร้างชื่อเรื่องและคำบรรยายใหม่ที่ดึงดูดและเหมาะสมกับหมวดหมู่ โดยยังคงรักษาความหมายหลักของชื่อเดิมไว้`;
}

export function validateVideoText(value: unknown, sourceTitle: string) {
  const result = resultSchema.parse(value);
  if (/[<>]|https?:\/\//i.test(result.title + result.description)) throw new Error("video_text_plain_text_required");
  const source = sourceTitle.normalize("NFKC").trim().toLocaleLowerCase("th");
  if (!source || !result.title.normalize("NFKC").toLocaleLowerCase("th").includes(source)) throw new Error("video_text_source_title_required");
  return result;
}

export async function generateVideoText(input: {
  apiKey: string; provider: AiProvider; model: string; sourceTitle: string; currentDescription?: string;
  categories?: string[]; tags?: string[]; actors?: string[];
}) {
  let response: Response;
  try {
    response = await fetch(`${AI_PROVIDER_DETAILS[input.provider].baseUrl}/responses`, {
      method: "POST", redirect: "error", signal: AbortSignal.timeout(45_000),
      headers: { Authorization: `Bearer ${input.apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: input.model, store: false, max_output_tokens: 1800,
        ...aiResponsePrompt(input.provider, instructions(input), JSON.stringify({
          sourceTitle: input.sourceTitle, currentDescription: input.currentDescription ?? "",
          categories: input.categories ?? [], tags: input.tags ?? [], actors: input.actors ?? [],
        })),
        text: { format: { type: "json_schema", name: "video_editor_text", strict: true, schema: {
          type: "object", properties: {
            title: { type: "string", minLength: 1, maxLength: 160 },
            description: { type: "string", minLength: 1, maxLength: 1800 },
          }, required: ["title", "description"], additionalProperties: false,
        } } },
      }),
    });
  } catch { throw new Error("content_ai_connection_failed"); }
  if (!response.ok) throw new Error(`content_ai_http_${response.status}`);
  const body = await response.json();
  if (body.status !== "completed") throw new Error("content_ai_incomplete_response");
  const output = (body.output ?? []).flatMap((item: { content?: { type: string; text?: string }[] }) => item.content ?? []);
  if (output.some((item: { type: string }) => item.type === "refusal")) throw new Error("content_ai_refused");
  const raw = output.filter((item: { type: string }) => item.type === "output_text").map((item: { text?: string }) => item.text ?? "").join("");
  try { return validateVideoText(JSON.parse(raw), input.sourceTitle); }
  catch { throw new Error("content_ai_invalid_response"); }
}
