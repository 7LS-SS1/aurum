import { describe, it, expect } from "vitest";
import { can, hasMinRole, ROLE_RANK } from "./permissions";

describe("can", () => {
  it("SYSTEM never passes any human-role action check", () => {
    expect(can("SYSTEM", "movie:view")).toBe(false);
    expect(can("SYSTEM", "audit:view")).toBe(false);
  });

  it("grants an action to exactly its minimum role and every role above it", () => {
    expect(can("SENIOR", "movie:review")).toBe(true);
    expect(can("MANAGER", "movie:review")).toBe(true);
    expect(can("HEAD", "movie:review")).toBe(true);
  });

  it("denies an action to every role below its minimum", () => {
    expect(can("STAFF", "movie:review")).toBe(false);
  });

  it("only HEAD passes movie:delete", () => {
    expect(can("HEAD", "movie:delete")).toBe(true);
    expect(can("MANAGER", "movie:delete")).toBe(false);
  });

  it("only HEAD and above pass audit:view", () => {
    expect(can("HEAD", "audit:view")).toBe(true);
    expect(can("MANAGER", "audit:view")).toBe(false);
  });

  it("comment:moderate requires at least SENIOR", () => {
    expect(can("STAFF", "comment:moderate")).toBe(false);
    expect(can("SENIOR", "comment:moderate")).toBe(true);
    expect(can("HEAD", "comment:moderate")).toBe(true);
  });
});

describe("hasMinRole", () => {
  it("SYSTEM never satisfies a minimum-role check", () => {
    expect(hasMinRole("SYSTEM", "STAFF")).toBe(false);
  });

  it("ranks roles in ascending order STAFF < SENIOR < MANAGER < HEAD", () => {
    expect(ROLE_RANK.STAFF).toBeLessThan(ROLE_RANK.SENIOR);
    expect(ROLE_RANK.SENIOR).toBeLessThan(ROLE_RANK.MANAGER);
    expect(ROLE_RANK.MANAGER).toBeLessThan(ROLE_RANK.HEAD);
  });

  it("passes when role rank is greater than or equal to min", () => {
    expect(hasMinRole("MANAGER", "STAFF")).toBe(true);
    expect(hasMinRole("MANAGER", "MANAGER")).toBe(true);
    expect(hasMinRole("MANAGER", "HEAD")).toBe(false);
  });
});
