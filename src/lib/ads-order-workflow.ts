import { getTransfer } from "./bank-transfer";
import { getRenewal, unchangedRenewal } from "./ads-renewal";
import { getPromptPay, hasPromptPay } from "./promptpay";
import { getSimulation } from "./ads-simulation";
export type OrderEvent = { id: string; date: string; action: string; before: string | null; after: string | null; note: string; role: string; reference: string | null };
export type WorkflowStep = { title: string; description: string; state: "done" | "current" | "pending" | "unknown"; date: string | null };

// Completion dates come only from persisted evidence, never from the display index.
export function orderWorkflow(order: AdminAdsOrder, events: OrderEvent[]): WorkflowStep[] {
  const simulation = getSimulation(order.quote);
  const latest = (action: string) => events.filter(e => e.action === (action.startsWith("stripe_") ? action : "ads_order_" + action)).at(-1)?.date || null;
  const stopped = ["REJECTED", "EXPIRED", "REFUND_REQUIRED", "REFUNDED"].includes(order.status);
  const afterActive = ["ACTIVE", "SCHEDULED", "GRACE", "REMOVAL_REQUIRED", "COMPLETED"].includes(order.status);
  if (unchangedRenewal(order.quote)) {
    const paid = simulation ? latest("sim_verify") : latest("stripe_banner_confirmed") || latest("gateway_confirm") || latest("confirm_payment");
    const approved = latest(simulation ? "sim_activate" : "activate");
    const current = afterActive ? 3 : order.status === "PAID" ? 2 : 1;
    return [["คำนวณค่าต่ออายุ", "ยืนยันราคาและตำแหน่งเดิม", order.createdAt], ["ชำระเงินและตรวจยอด", "ชำระภายในกำหนด 3 วัน แล้วให้เจ้าหน้าที่ตรวจยอด", paid], ["อนุมัติต่อสัญญา", "คงตำแหน่งเดิม นับรอบใหม่ต่อจากวันสิ้นสุดเดิม", approved]].map(([title, description, date], index) => ({ title: title!, description: description!, date: date || null, state: date ? "done" : !stopped && index === current ? "current" : index < current ? "unknown" : "pending" }));
  }
  const definitions = simulation ? [
    ["รับคำสั่งซื้อ", "บันทึกรายการและพื้นที่ที่ลูกค้าเลือก", order.createdAt],
    ["ตรวจสอบการชำระเงิน", "ตรวจยอดและเลขอ้างอิงก่อนรับงาน", latest("sim_verify")],
    ["รับงานติดตั้ง", "เจ้าหน้าที่รับงานและเริ่มจัดวางสื่อ", latest("install") || latest("sim_install")],
    ["ติดตั้งและส่งตรวจ", "ติดตั้งให้ครบทุกตำแหน่ง แล้วส่งตรวจความถูกต้อง", latest("review_installation") || latest("sim_review")],
    ["อนุมัติเริ่มบริการ", "เริ่มนับระยะสัญญาหลังอนุมัติเท่านั้น", latest("sim_activate") || order.startsAt],
  ] : [
    ["รับคำสั่งซื้อ", "บันทึกข้อมูลลูกค้าและรายการโฆษณา", order.createdAt],
    ["ตรวจคำขอ", "ตรวจพื้นที่และเปิดช่องทางชำระเงิน", latest("approve") || latest("promptpay_created")],
    ["ตรวจสอบการชำระเงิน", hasPromptPay(order.quote) ? "ตรวจผลยืนยันยอดจาก Gateway Sandbox" : "ยืนยันยอดชำระกับผู้ให้บริการ", latest("stripe_banner_confirmed") || latest("confirm_payment") || latest("gateway_confirm")],
    ["รับงานติดตั้ง", "มอบหมายผู้รับผิดชอบและกำหนดส่ง", latest("install")],
    ["ติดตั้งและส่งตรวจ", "แนบหลักฐานทุกตำแหน่งก่อนส่งตรวจ", latest("review_installation")],
    ["อนุมัติเริ่มบริการ", "ตรวจผลงานแล้วเริ่มสัญญา", latest("activate") || order.startsAt],
  ];
  const current = afterActive ? definitions.length : simulation
    ? ({ checkout: 1, submitted: 1, verified: 2, installing: 3, approval: 4, active: 5 }[simulation.phase])
    : (order.status === "PAID" ? ({ queued: 3, installing: 4, review: 5, approved: 6 }[order.fulfillmentStage || "queued"]) : ({ REVIEW: 1, PAYMENT: 2, PAYMENT_REVIEW: 2 }[order.status] ?? -1));
  return definitions.map(([title, description, date], index) => ({
    title: title!, description: description!, date: date || null,
    state: date ? "done" : !stopped && index === current ? "current" : index < (current ?? -1) ? "unknown" : "pending",
  }));
}

export const actionHelp: Record<string, string> = {
  assign: "กำหนดผู้รับผิดชอบและเวลาส่งงาน ลูกค้าจะเห็นชื่อผู้ดูแลและกำหนดเสร็จ",
  install: "รับงานและเริ่มติดตั้งตามตำแหน่งและไฟล์ที่ลูกค้าเลือก",
  review_installation: "ตรวจ Desktop และ Mobile แล้วแนบลิงก์หลักฐานให้ครบทุกตำแหน่งก่อนส่งตรวจ",
  return_installation: "ระบุสิ่งที่ต้องแก้ไข งานจะกลับไปขั้นตอนติดตั้ง ยังไม่เริ่มนับสัญญา",
  update_progress: "แจ้งความคืบหน้าให้ลูกค้า โดยไม่เปลี่ยนสถานะงานหรือวันสัญญา",
  gateway_confirm: "ตรวจยอดและเลขอ้างอิงที่ระบบดึงจาก Gateway Sandbox แล้ว ยืนยันรับคำสั่งซื้อเพื่อเริ่มดำเนินงาน ยังไม่เริ่มนับสัญญา",
  gateway_close_refund: "ปิดผลทดสอบรายการคืนเงิน Sandbox เท่านั้น ไม่มีการโอนหรือคืนเงินจริง",
  approve: "ตรวจสอบเว็บไซต์ พื้นที่ และไฟล์แนบก่อนเปิดลิงก์ชำระเงิน ระบบจะกันพื้นที่ไว้ 24 ชั่วโมง",
  confirm_payment: "ตรวจยอดเงินจริงและเลขอ้างอิงจากระบบของผู้ให้บริการให้ตรงกับคำสั่งซื้อ การกดยืนยันยังไม่เริ่มนับสัญญา",
  activate: "ตรวจว่าติดตั้งสื่อครบทุกช่อง ลิงก์ปลายทางถูกต้อง และแสดงผลได้ทั้งคอมพิวเตอร์และมือถือ การยืนยันจะเริ่มนับสัญญาทันที",
  sim_verify: "เปรียบเทียบยอดและเลขอ้างอิงจำลองด้านล่าง เมื่อยืนยันแล้วคำสั่งซื้อจะเข้าสู่คิวติดตั้ง ยังไม่เริ่มนับสัญญา",
  sim_install: "ตรวจข้อมูลลูกค้า เว็บไซต์ และไฟล์แนบให้ครบ แล้วรับงานเข้าสู่ขั้นตอนติดตั้งจำลอง",
  sim_review: "ตรวจว่าจัดเตรียมสื่อและลิงก์ครบทุกตำแหน่ง แล้วส่งงานให้ตรวจอนุมัติ ยังไม่เริ่มนับสัญญา",
  sim_activate: "ยืนยันว่าตรวจผลงานครบแล้ว ระบบจะบันทึกวันเริ่มและวันสิ้นสุดสัญญาจำลองทันที",
  sim_retry: "แจ้งเหตุผลให้ลูกค้าทดลองชำระใหม่ ระบบจะล้างใบรับจำลองปัจจุบัน โดยไม่ต่อเวลาที่กันพื้นที่",
  sim_update: "แจ้งความคืบหน้าให้ลูกค้า ข้อความนี้จะแสดงในประวัติคำสั่งซื้อ โดยไม่เปลี่ยนขั้นตอนงาน",
  sim_cancel: "ยุติรายการทดสอบและคืนพื้นที่จำลอง ประวัติเดิมยังคงอยู่ ไม่มีการคืนเงินจริง",
  reject: "ระบุเหตุผลที่ไม่อนุมัติให้ลูกค้าทราบ ประวัติคำสั่งซื้อจะยังคงอยู่",
  request_refund: "หยุดแสดงป้ายก่อนส่งเข้าคิวคืนเงิน การบันทึกนี้ยังไม่ใช่การคืนเงินจริง",
  confirm_refund: "ตรวจว่าคืนเงินจริงผ่านผู้ให้บริการแล้ว และกรอกเลขอ้างอิงการคืนเงิน",
  confirm_removed: "ตรวจว่านำป้ายออกจากทุกตำแหน่งแล้ว ก่อนปิดงานและคืนพื้นที่ให้จองใหม่",
};
export type AdminAdsOrder = { fulfillmentStage?: string; assignedTo?: string | null; assignedName?: string | null; dueAt?: string | null; installationProof?: {slot:string;url:string}[] | null; currentArtwork?: {slot:string;fileId:string;name:string;targetUrl:string}[] | null; refundAmount?:number|null; refundReference?:string|null; refundedAt?:string|null; renewals?: { id: string; status: string; slots: string[] }[]; renewalOfId?: string | null; id: string; slots: string[]; createdAt: string; revision: number; status: string; amount: number; days: number; quote: { website?: {name:string;url:string}; items: string[]; attachments?: { slot: string; fileId: string; name: string; targetUrl: string }[] }; customer: { name: string; email: string; contact: string }; note: string; staffNote: string; artworkUrl: string; targetUrl: string; startsAt: string | null; endsAt: string | null; holdUntil?: string | null; paymentReference?: string | null };

const actions: Record<string, [string, string][]> = {
  SCHEDULED: [["request_refund", "ยกเลิกรอบต่ออายุที่ยังไม่เริ่ม → รอคืนเงิน"]],
  GRACE: [["request_refund", "หยุดบริการและส่งเข้าคิวคืนเงิน"]],
  REVIEW: [["approve", "เปิดชำระเงินและกันพื้นที่ 24 ชั่วโมง"], ["reject", "ไม่อนุมัติ"]],
  PAYMENT: [["confirm_payment", "ยืนยันยอดเงินจริงจากผู้ให้บริการ"]],
  EXPIRED: [["confirm_payment", "บันทึกเงินเข้าหลังหมดเวลา → รอคืนเงิน"]],
  PAID: [["activate", "ติดตั้งแล้ว · อนุมัติเริ่มแสดง"], ["request_refund", "ส่งเข้าคิวคืนเงิน"]],
  ACTIVE: [["request_refund", "หยุดแสดงและส่งเข้าคิวคืนเงิน"]],
  REFUND_REQUIRED: [["confirm_refund", "ยืนยันคืนเงินจริงแล้ว"]],
  REMOVAL_REQUIRED: [["confirm_removed", "นำป้ายออกแล้ว · คืนพื้นที่ให้จอง"]],
};
export function actionOptions(order: AdminAdsOrder): [string, string][] {
  if(getTransfer(order.quote) && ["REVIEW","PAYMENT","PAYMENT_REVIEW","EXPIRED"].includes(order.status))return [];
  const normal: [string, string][] = (actions[order.status] || []).map(([key, label]) => [key, key === "activate" && getRenewal(order.quote) ? "อนุมัติต่ออายุ · นับต่อวันสิ้นสุดเดิม" : label]);
  const simulation = getSimulation(order.quote);
  if (order.status === "PAID" && !unchangedRenewal(order.quote)) {
    const stage = simulation ? ({ verified: "queued", installing: "installing", approval: "review" }[simulation.phase as "verified" | "installing" | "approval"] || "queued") : order.fulfillmentStage || "queued";
    const primary: [string, string][] = stage === "review" ? [[simulation ? "sim_activate" : "activate", "อนุมัติผลงาน → เริ่มสัญญา"], ["return_installation", "ส่งกลับแก้ไข"]] : stage === "installing" ? [["review_installation", "ติดตั้งครบแล้ว → แนบหลักฐานส่งตรวจ"]] : [[order.assignedTo ? "install" : "assign", order.assignedTo ? "รับงาน → เริ่มติดตั้ง" : "กำหนดผู้รับผิดชอบและกำหนดส่ง"]];
    return [...primary, ["update_progress", "แจ้งความคืบหน้า"], [simulation ? "sim_cancel" : "request_refund", simulation ? "ยุติรายการจำลอง" : "ส่งเข้าคิวคืนเงิน"]];
  }
  if (!simulation && hasPromptPay(order.quote)) {
    if (!getPromptPay(order.quote)) return [];
    if (order.status === "PAYMENT_REVIEW") return [["gateway_confirm", "ตรวจยอดแล้ว → รับคำสั่งซื้อ Sandbox"]];
    if (order.status === "REFUND_REQUIRED") return [["gateway_close_refund", "ปิดผลทดสอบคืนเงิน Sandbox"]];
    if (["PAYMENT", "REVIEW", "EXPIRED"].includes(order.status)) return [];
    return [...normal.map(([key, label]): [string,string] => [key, label + " (Sandbox)"]), ...(["ACTIVE", "GRACE", "SCHEDULED"].includes(order.status) ? [["update_progress", "แจ้งความคืบหน้า"] as [string,string]] : [])];
  }
  if (!simulation) return ["ACTIVE", "GRACE", "SCHEDULED"].includes(order.status) ? [["update_progress", "แจ้งความคืบหน้า"], ...normal] : normal;
  if (["REJECTED", "COMPLETED", "REFUNDED"].includes(order.status)) return [];
  if (order.status === "REMOVAL_REQUIRED") return [["confirm_removed", "นำป้ายที่หมดสิทธิ์ออกแล้ว · ปิดรอบเดิม"]];
  const options: [string, string][] = [];
  if (order.status === "PAYMENT" && simulation.phase === "submitted") {
    if (simulation.receipt?.outcome === "success") options.push(["sim_verify", "ยืนยันยอดจำลองถูกต้อง → รับคำสั่งซื้อ"]);
    options.push(["sim_retry", "ส่งกลับให้ลูกค้าทดลองชำระใหม่"]);
  }
  if (order.status === "PAID") {
    if (simulation.phase === "verified") options.push(unchangedRenewal(order.quote) ? ["sim_activate", "อนุมัติต่ออายุ · คงตำแหน่งเดิม"] : ["sim_install", "รับงาน → กำลังติดตั้งจำลอง"]);
    if (simulation.phase === "installing") options.push(["sim_review", "ติดตั้งจำลองเสร็จ → ส่งตรวจผลงาน"]);
    if (simulation.phase === "approval") options.push(["sim_activate", "อนุมัติผลงานจำลอง → เริ่มนับสัญญา"]);
  }
  if (["PAID", "ACTIVE"].includes(order.status)) options.push(["sim_update", "อัปเดตความคืบหน้าให้ลูกค้า"]);
  options.push(["sim_cancel", "ยุติรายการจำลองและคืนพื้นที่ทดสอบ"]);
  return options;
}
