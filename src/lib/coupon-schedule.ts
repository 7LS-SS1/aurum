export function bangkokInput(iso: string) {
  const time = Date.parse(iso);
  return Number.isFinite(time) ? new Date(time + 7 * 3600000).toISOString().slice(0, 16) : "";
}
export function bangkokIso(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value)) return "";
  const time = Date.parse(value + ":00+07:00");
  return Number.isFinite(time) ? new Date(time).toISOString() : "";
}
export function couponState(c: { enabled: boolean; startsAt: string; endsAt: string }, now: number) {
  if (!c.enabled) return "ปิดใช้งาน";
  if (!Number.isFinite(Date.parse(c.startsAt)) || !Number.isFinite(Date.parse(c.endsAt))) return "วันที่ไม่ถูกต้อง";
  if (now < Date.parse(c.startsAt)) return "รอเริ่ม";
  return now >= Date.parse(c.endsAt) ? "หมดอายุ" : "ใช้งานได้";
}
export const couponDate = (iso: string) => new Date(iso).toLocaleString("th-TH", { timeZone: "Asia/Bangkok", dateStyle: "medium", timeStyle: "short" });
