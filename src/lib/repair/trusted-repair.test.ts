import { describe, expect, it } from "vitest";
import {
  REPAIR_SQL,
  RESET_SQL,
  TRUSTED_REPAIR_EXPRESSION,
  VULNERABLE_EXPRESSION,
  findTrustedRepairTarget,
  isTrustedRepairExpression,
} from "./trusted-repair";
import type { AuditFinding } from "../audit/types";

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

describe("findTrustedRepairTarget", () => {
  function finding(overrides: Partial<AuditFinding>): AuditFinding {
    return {
      id: "f1",
      ruleId: "RLS_ALLOW_ALL",
      tier: "critical",
      confidence: "high",
      title: "t",
      repository: "r",
      filePath: "supabase/migrations/001.sql",
      line: 1,
      endLine: null,
      table: "public.clients",
      objectType: "table",
      operation: "SELECT",
      role: "authenticated",
      roles: ["authenticated"],
      evidence: "using (true)",
      explanation: "e",
      remediation: "r",
      assumptions: null,
      liveValidationAvailable: false,
      clause: "USING",
      expression: "true",
      aiReview: null,
      ...overrides,
    } as AuditFinding;
  }

  it("finds an allow-all USING policy on the repair target table", () => {
    const target = findTrustedRepairTarget([finding({})]);
    expect(target?.ruleId).toBe("RLS_ALLOW_ALL");
  });

  it("also matches the anon allow-all rule for the same table and clause", () => {
    const target = findTrustedRepairTarget([finding({ ruleId: "VIBE_ANON_ALLOW_ALL" })]);
    expect(target).not.toBeNull();
  });

  it("tolerates quoting and casing differences in the table name", () => {
    const target = findTrustedRepairTarget([finding({ table: '"Public"."Clients"' })]);
    expect(target).not.toBeNull();
  });

  it("returns null for a different table, however severe", () => {
    // The trusted repair rewrites one named policy on one named table. It
    // is not a general fix and must never be offered as one.
    expect(findTrustedRepairTarget([finding({ table: "public.payments" })])).toBeNull();
  });

  it("returns null for a WITH CHECK clause, which this repair does not address", () => {
    expect(findTrustedRepairTarget([finding({ clause: "WITH CHECK" })])).toBeNull();
  });

  it("returns null for a rule the trusted repair does not fix", () => {
    // RLS being disabled entirely needs a different statement than
    // rewriting a policy's USING expression.
    expect(findTrustedRepairTarget([finding({ ruleId: "RLS_DISABLED_WITH_POLICIES" })])).toBeNull();
  });

  it("returns null for findings with no table at all", () => {
    expect(findTrustedRepairTarget([finding({ table: null })])).toBeNull();
  });

  it("returns null for an empty finding list", () => {
    expect(findTrustedRepairTarget([])).toBeNull();
  });
});
