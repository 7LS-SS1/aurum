import { describe, expect, it } from "vitest";
import { canDistributeMovie } from "./distribution-policy";

describe("canDistributeMovie", () => {
  it.each(["APPROVED", "PARTIAL", "FAILED", "DONE"])("allows redistribution from %s", (status) => {
    expect(canDistributeMovie(status, "SYSTEM")).toBe(true);
  });

  it("allows managers and heads to publish a draft", () => {
    expect(canDistributeMovie("DRAFT", "MANAGER")).toBe(true);
    expect(canDistributeMovie("DRAFT", "HEAD")).toBe(true);
    expect(canDistributeMovie("DRAFT", "SYSTEM")).toBe(false);
  });

  it.each(["READY_FOR_REVIEW", "IN_REVIEW", "REJECTED", "READY_FOR_APPROVAL", "PUBLISHING", "ARCHIVED"])(
    "rejects redistribution from %s",
    (status) => expect(canDistributeMovie(status, "HEAD")).toBe(false),
  );
});
