type StepState = "pending" | "current" | "done" | "blocked";

const STEPS = [
  { key: "upload", label: "อัปโหลดวิดีโอ" },
  { key: "details", label: "กรอกรายละเอียด" },
  { key: "processing", label: "ประมวลผล" },
  { key: "complete", label: "เสร็จสิ้น" },
] as const;

type StepKey = (typeof STEPS)[number]["key"];

function stateFor(status: string, stepKey: StepKey, mediaReady: boolean, detailsReady: boolean): StepState {
  const processingStatuses = new Set(["READY_FOR_REVIEW", "IN_REVIEW", "READY_FOR_APPROVAL", "APPROVED", "PUBLISHING"]);
  const completeStatuses = new Set(["DONE", "ARCHIVED"]);
  const blockedStatuses = new Set(["REJECTED", "PARTIAL", "FAILED"]);

  if (completeStatuses.has(status)) return "done";
  if (blockedStatuses.has(status)) {
    if (stepKey === "upload" || stepKey === "details") return "done";
    return stepKey === "processing" ? "blocked" : "pending";
  }
  if (processingStatuses.has(status)) {
    if (stepKey === "upload" || stepKey === "details") return "done";
    return stepKey === "processing" ? "current" : "pending";
  }

  if (stepKey === "upload") return mediaReady ? "done" : "current";
  if (stepKey === "details") {
    if (!mediaReady) return "pending";
    return detailsReady ? "done" : "current";
  }
  if (stepKey === "processing") return mediaReady && detailsReady ? "current" : "pending";
  return "pending";
}

export function WorkflowSteps({
  status,
  mediaReady = false,
  detailsReady = false,
}: {
  status: string;
  mediaReady?: boolean;
  detailsReady?: boolean;
}) {
  return (
    <div className="workflow-steps">
      {STEPS.map((step, i) => {
        const state = stateFor(status, step.key, mediaReady, detailsReady);
        return (
          <div key={step.key} style={{ display: "flex", alignItems: "center", flex: i === STEPS.length - 1 ? "none" : 1 }}>
            <div className={`wf-step ${state}`}>
              <span className="dot">{state === "done" ? "OK" : state === "blocked" ? "!" : i + 1}</span>
              <span className="lbl">{step.label}</span>
            </div>
            {i < STEPS.length - 1 && <div className={`wf-line ${state === "done" ? "done" : ""}`} />}
          </div>
        );
      })}
    </div>
  );
}
