import { describe, expect, it } from "vitest";
import { describeDistributionOutcome } from "./distribution-outcome";

describe("describeDistributionOutcome", () => {
  it("reports a complete success", () => {
    expect(describeDistributionOutcome(
      { status: "done", summary: { total: 2, success: 2 } },
      "อัปเดตข้อมูลวิดีโอแล้ว",
    )).toEqual({ ok: true, message: "อัปเดตข้อมูลวิดีโอแล้ว 2/2 เว็บ" });
  });

  it("reports partial success with the real counts", () => {
    expect(describeDistributionOutcome(
      { status: "partial", summary: { total: 14, success: 3 } },
      "อัปเดตข้อมูลวิดีโอแล้ว",
    )).toEqual({ ok: true, message: "สำเร็จบางส่วน 3/14 เว็บ — ล้มเหลว 11 เว็บ" });
  });

  it("does not report success when every destination failed", () => {
    expect(describeDistributionOutcome(
      { status: "failed", summary: { total: 14, success: 0 } },
      "อัปเดตข้อมูลวิดีโอแล้ว",
    )).toEqual({ ok: false, message: "ดำเนินการไม่สำเร็จ 0/14 เว็บ" });
  });
});
