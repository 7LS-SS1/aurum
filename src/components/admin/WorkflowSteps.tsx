type StepState = "pending" | "current" | "done" | "blocked";

const STEPS = [
  { key: "draft", label: "ร่าง" },
  { key: "review", label: "ตรวจสอบ" },
  { key: "approval", label: "อนุมัติ" },
  { key: "publish", label: "เผยแพร่" },
] as const;

function stateFor(status: string, stepKey: (typeof STEPS)[number]["key"]): StepState {
  const order: Record<string, number> = {
    DRAFT: 0,
    READY_FOR_REVIEW: 1,
    IN_REVIEW: 1,
    REJECTED: 1,
    READY_FOR_APPROVAL: 2,
    APPROVED: 3,
    PUBLISHING: 3,
    DONE: 3,
    PARTIAL: 3,
    FAILED: 3,
    ARCHIVED: 3,
  };
  const stepIndex = STEPS.findIndex((s) => s.key === stepKey);
  const currentIndex = order[status] ?? 0;
  const isBlocked = (status === "REJECTED" && stepKey === "review") || ((status === "PARTIAL" || status === "FAILED") && stepKey === "publish");

  if (isBlocked) return "blocked";
  if (stepIndex < currentIndex) return "done";
  if (stepIndex === currentIndex) return status === "DONE" || status === "ARCHIVED" ? "done" : "current";
  return "pending";
}

/** Visual "where is this video right now" strip — draft/edit forms use it to orient the editor. */
export function WorkflowSteps({ status }: { status: string }) {
  return (
    <div className="workflow-steps">
      {STEPS.map((step, i) => {
        const state = stateFor(status, step.key);
        return (
          <div key={step.key} style={{ display: "flex", alignItems: "center", flex: i === STEPS.length - 1 ? "none" : 1 }}>
            <div className={`wf-step ${state}`}>
              <span className="dot">{state === "done" ? "✓" : state === "blocked" ? "!" : i + 1}</span>
              <span className="lbl">{step.label}</span>
            </div>
            {i < STEPS.length - 1 && <div className={`wf-line ${state === "done" ? "done" : ""}`} />}
          </div>
        );
      })}
    </div>
  );
}
