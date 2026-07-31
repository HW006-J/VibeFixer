import { describe, expect, it } from "vitest";
import {
  REPAIR_SQL,
  RESET_SQL,
  TRUSTED_REPAIR_EXPRESSION,
  VULNERABLE_EXPRESSION,
  isTrustedRepairExpression,
} from "./trusted-repair";

describe("isTrustedRepairExpression", () => {
  it("accepts the exact trusted expression", () => {
    expect(isTrustedRepairExpression(TRUSTED_REPAIR_EXPRESSION)).toBe(true);
  });

  it("accepts the operands in either order", () => {
    expect(isTrustedRepairExpression("trainer_id = auth.uid()")).toBe(true);
  });

  it("accepts extra whitespace and surrounding parens", () => {
    expect(isTrustedRepairExpression("  ( auth.uid()   =   trainer_id )  ")).toBe(true);
  });

  it("rejects the vulnerable literal true", () => {
    expect(isTrustedRepairExpression(VULNERABLE_EXPRESSION)).toBe(false);
  });

  it("rejects an expression referencing a different column", () => {
    expect(isTrustedRepairExpression("auth.uid() = owner_id")).toBe(false);
  });

  it("rejects an expression that is not a recognised owner check at all", () => {
    expect(isTrustedRepairExpression("status = 'active'")).toBe(false);
  });

  it("rejects an attempt to smuggle extra SQL alongside a valid-looking expression", () => {
    expect(isTrustedRepairExpression("auth.uid() = trainer_id); drop table public.clients; --")).toBe(false);
  });
});

describe("trusted SQL constants", () => {
  it("REPAIR_SQL never contains the vulnerable literal true as the policy expression", () => {
    expect(REPAIR_SQL).not.toMatch(/using\s*\(\s*true\s*\)/i);
    expect(REPAIR_SQL).toContain(TRUSTED_REPAIR_EXPRESSION);
  });

  it("RESET_SQL restores exactly the original vulnerable expression", () => {
    expect(RESET_SQL).toMatch(/using\s*\(\s*true\s*\)/i);
  });
});
