import { describe, expect, it } from "vitest";
import { buildSecurityReport } from "./report";
import type { UnifiedFinding } from "./finding";

function finding(overrides: Partial<UnifiedFinding>): UnifiedFinding {
  return {
    id: "f-1",
    ruleId: "TEST",
    category: "iam",
    severity: "high",
    confidence: "high",
    title: "Test",
    impact: "Impact",
    recommendation: "Fix",
    filePath: "a.json",
    startLine: 1,
    endLine: 1,
    redactedEvidence: "evidence",
    assumptions: null,
    verification: "static",
    ...overrides,
  };
}

describe("buildSecurityReport", () => {
  it("computes deterministic counts and top 3 findings", () => {
    const findings: UnifiedFinding[] = [
      finding({ id: "c1", severity: "critical", title: "Critical one" }),
      finding({ id: "h1", severity: "high", title: "High one" }),
      finding({ id: "h2", severity: "high", title: "High two" }),
      finding({ id: "r1", severity: "review", title: "Review one" }),
    ];

    const report = buildSecurityReport({
      repository: "o/r",
      filesInspected: ["a.json"],
      unifiedFindings: findings,
      checksRun: 20,
      categoriesAssessed: ["iam"],
      unsupportedContext: [],
    });

    expect(report.counts.critical).toBe(1);
    expect(report.counts.high).toBe(2);
    expect(report.counts.review).toBe(1);
    expect(report.topFindings).toHaveLength(3);
    expect(report.overallRisk).toBe("critical");
  });
});
