import { describe, expect, it } from "vitest";
import { computeSecuritySummary } from "./summary";
import type { AuditFinding, AuditReport } from "./types";

function makeReport(overrides: Partial<AuditReport> = {}): AuditReport {
  return {
    repository: "some-owner/some-repo",
    isDemoRepository: false,
    findings: [],
    coverage: {
      filesScanned: [],
      statementsInspected: 0,
      policiesInspected: 0,
      tablesDiscovered: 0,
      criticalFindingCount: 0,
      highRiskFindingCount: 0,
      needsReviewCount: 0,
      noIssueFoundCount: 0,
      aiReviewsPerformed: 0,
      tables: [],
    },
    durationMs: 10,
    ...overrides,
  };
}

function finding(overrides: Partial<AuditFinding>): AuditFinding {
  return {
    id: "id-1",
    ruleId: "RLS_ALLOW_ALL",
    tier: "critical",
    confidence: "high",
    title: "Allow-all RLS policy on \"public.clients\"",
    repository: "some-owner/some-repo",
    filePath: "supabase/migrations/0001.sql",
    line: 1,
    endLine: null,
    table: "public.clients",
    objectType: "table",
    operation: "SELECT",
    role: "authenticated",
    roles: ["authenticated"],
    evidence: "using (true)",
    explanation: "explanation",
    remediation: "Scope the expression to the requesting user.",
    assumptions: null,
    liveValidationAvailable: false,
    clause: "USING",
    expression: "true",
    aiReview: null,
    ...overrides,
  };
}

describe("computeSecuritySummary", () => {
  it("reports risk level 'none' and no recommendation when nothing was scanned", () => {
    const summary = computeSecuritySummary(makeReport());
    expect(summary.riskLevel).toBe("none");
    expect(summary.recommendedNextStep).toBeNull();
    expect(summary.topRisks).toEqual([]);
  });

  it("reports risk level 'low' when policies were checked but nothing was flagged", () => {
    const summary = computeSecuritySummary(
      makeReport({ coverage: { ...makeReport().coverage, policiesInspected: 3, tablesDiscovered: 2 } }),
    );
    expect(summary.riskLevel).toBe("low");
  });

  it("reports risk level 'critical' when any critical finding exists, even alongside high/review findings", () => {
    const critical = finding({ tier: "critical" });
    const high = finding({ tier: "high", ruleId: "VIBE_LOGIN_ONLY_POLICY" });
    const review = finding({ tier: "review", ruleId: "RLS_POLICY_NEEDS_REVIEW" });
    const report = makeReport({
      findings: [review, high, critical],
      coverage: {
        ...makeReport().coverage,
        criticalFindingCount: 1,
        highRiskFindingCount: 1,
        needsReviewCount: 1,
      },
    });

    const summary = computeSecuritySummary(report);
    expect(summary.riskLevel).toBe("critical");
    expect(summary.criticalCount).toBe(1);
    expect(summary.highCount).toBe(1);
    expect(summary.needsReviewCount).toBe(1);
    // Most severe first.
    expect(summary.topRisks[0]).toBe(critical.title);
    expect(summary.recommendedNextStep).toBe(critical.remediation);
  });

  it("reports risk level 'high' when the worst finding is high, not critical", () => {
    const report = makeReport({
      findings: [finding({ tier: "high" })],
      coverage: { ...makeReport().coverage, highRiskFindingCount: 1 },
    });
    expect(computeSecuritySummary(report).riskLevel).toBe("high");
  });

  it("reports risk level 'moderate' when the worst finding is needs-review", () => {
    const report = makeReport({
      findings: [finding({ tier: "review" })],
      coverage: { ...makeReport().coverage, needsReviewCount: 1 },
    });
    expect(computeSecuritySummary(report).riskLevel).toBe("moderate");
  });

  it("caps topRisks at 3 entries even with more findings", () => {
    const report = makeReport({
      findings: [
        finding({ id: "1", title: "A" }),
        finding({ id: "2", title: "B" }),
        finding({ id: "3", title: "C" }),
        finding({ id: "4", title: "D" }),
      ],
      coverage: { ...makeReport().coverage, criticalFindingCount: 4 },
    });
    expect(computeSecuritySummary(report).topRisks).toHaveLength(3);
  });

  it("does not report live verification as performed when no live evidence is supplied", () => {
    const summary = computeSecuritySummary(makeReport());
    expect(summary.liveVerification).toEqual({ performed: false, summary: null });
  });

  it("reports real live verification evidence when supplied, showing the leak", () => {
    const summary = computeSecuritySummary(makeReport(), { totalRowsReturned: 4, ownRowCount: 2, leakedRowCount: 2 });
    expect(summary.liveVerification.performed).toBe(true);
    expect(summary.liveVerification.summary).toBe("Confirmed — 2 cross-tenant rows exposed.");
  });

  it("reports real live verification evidence when supplied, showing protection", () => {
    const summary = computeSecuritySummary(makeReport(), { totalRowsReturned: 2, ownRowCount: 2, leakedRowCount: 0 });
    expect(summary.liveVerification.performed).toBe(true);
    expect(summary.liveVerification.summary).toBe("Confirmed protected — 0 cross-tenant rows exposed (2 own rows returned).");
  });

  it("reports the number of checks run as the size of the deterministic rule pack", () => {
    const summary = computeSecuritySummary(makeReport());
    expect(summary.checksRun).toBeGreaterThanOrEqual(12);
  });
});
