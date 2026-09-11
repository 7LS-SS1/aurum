export interface DistributionOutcomeSummary {
  status: "done" | "partial" | "failed";
  summary: { total: number; success: number };
}

export interface DistributionOutcome {
  ok: boolean;
  message: string;
}

/** Converts a 2xx distribution response into an honest user-facing outcome. */
export function describeDistributionOutcome(
  result: DistributionOutcomeSummary,
  successMessage: string,
): DistributionOutcome {
  const total = Math.max(0, result.summary.total);
  const success = Math.min(Math.max(0, result.summary.success), total);
  const failed = total - success;

  if (result.status === "done" && total > 0 && success === total) {
    return { ok: true, message: `${successMessage} ${success}/${total} เว็บ` };
  }
  if (success > 0) {
    return { ok: true, message: `สำเร็จบางส่วน ${success}/${total} เว็บ — ล้มเหลว ${failed} เว็บ` };
  }
  return { ok: false, message: `ดำเนินการไม่สำเร็จ 0/${total} เว็บ` };
}
