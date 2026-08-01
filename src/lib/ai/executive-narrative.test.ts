import { describe, expect, it, vi, afterEach } from "vitest";
import { generateExecutiveNarrative } from "./executive-narrative";
import { buildSecurityReport } from "@/lib/security/report";
import type { UnifiedFinding } from "@/lib/security/finding";

vi.mock("./generate-structured", () => ({
  generateStructuredJson: vi.fn(),
}));

import { generateStructuredJson } from "./generate-structured";

afterEach(() => {
  vi.resetAllMocks();
});

const baseFinding: UnifiedFinding = {
  id: "supabase|existing-id",
  ruleId: "VIBE_ANON_ALLOW_ALL",
  category: "supabase",
  severity: "critical",
  confidence: "high",
  title: "Anon allow all",
  impact: "Impact",
  recommendation: "Fix RLS",
  filePath: "supabase/migrations/1.sql",
  startLine: 1,
  endLine: 1,
  redactedEvidence: "using (true)",
  assumptions: null,
  verification: "static",
};

describe("generateExecutiveNarrative", () => {
  it("removes invented finding IDs from Gemini output", async () => {
    const report = buildSecurityReport({
      repository: "o/r",
      filesInspected: ["a.sql"],
      unifiedFindings: [baseFinding],
      checksRun: 12,
      categoriesAssessed: ["supabase"],
      unsupportedContext: [],
    });

    vi.mocked(generateStructuredJson).mockResolvedValue({
      performed: true,
      data: {
        executiveSummary: "Summary",
        blastRadiusSummary: "Blast",
        prioritisedFindingIds: ["supabase|existing-id", "invented-id"],
        remediationOrder: ["Fix RLS"],
        uncertainty: "Some",
        missingContext: [],
      },
      model: "gemini-test",
      durationMs: 1,
    });

    const result = await generateExecutiveNarrative({
      repository: "o/r",
      report,
      findings: [baseFinding],
      liveVerificationSummary: null,
    });

    expect(result.performed).toBe(true);
    if (result.performed) {
      expect(result.narrative.prioritisedFindingIds).toEqual(["supabase|existing-id"]);
    }
  });

  it("counts only live_verified findings towards verifiedFindingCount, distinct from the total scanned count", async () => {
    const staticFinding: UnifiedFinding = { ...baseFinding, id: "supabase|static-1", verification: "static" };
    const liveVerifiedFinding: UnifiedFinding = {
      ...baseFinding,
      id: "supabase|live-1",
      verification: "live_verified",
    };
    const needsReviewFinding: UnifiedFinding = {
      ...baseFinding,
      id: "supabase|review-1",
      severity: "review",
      verification: "needs_review",
    };

    const report = buildSecurityReport({
      repository: "o/r",
      filesInspected: ["a.sql"],
      unifiedFindings: [staticFinding, liveVerifiedFinding, needsReviewFinding],
      checksRun: 12,
      categoriesAssessed: ["supabase"],
      unsupportedContext: [],
    });

    vi.mocked(generateStructuredJson).mockResolvedValue({
      performed: true,
      data: {
        executiveSummary: "Summary",
        blastRadiusSummary: "Blast",
        prioritisedFindingIds: [],
        remediationOrder: [],
        uncertainty: "Some",
        missingContext: [],
      },
      model: "gemini-test",
      durationMs: 1,
    });

    const result = await generateExecutiveNarrative({
      repository: "o/r",
      report,
      findings: [staticFinding, liveVerifiedFinding, needsReviewFinding],
      liveVerificationSummary: "2 cross-tenant rows exposed",
    });

    expect(result.performed).toBe(true);
    if (result.performed) {
      // 3 findings were scanned in total, but only 1 was actually live-verified.
      expect(result.verifiedFindingCount).toBe(1);
    }
  });

  it("reports zero verified findings when nothing was live-verified, without ever counting static findings as verified", async () => {
    const staticFinding: UnifiedFinding = { ...baseFinding, id: "supabase|static-only", verification: "static" };

    const report = buildSecurityReport({
      repository: "o/r",
      filesInspected: ["a.sql"],
      unifiedFindings: [staticFinding],
      checksRun: 12,
      categoriesAssessed: ["supabase"],
      unsupportedContext: [],
    });

    vi.mocked(generateStructuredJson).mockResolvedValue({
      performed: true,
      data: {
        executiveSummary: "Summary",
        blastRadiusSummary: "Blast",
        prioritisedFindingIds: [],
        remediationOrder: [],
        uncertainty: "Some",
        missingContext: [],
      },
      model: "gemini-test",
      durationMs: 1,
    });

    const result = await generateExecutiveNarrative({
      repository: "o/r",
      report,
      findings: [staticFinding],
      liveVerificationSummary: null,
    });

    expect(result.performed).toBe(true);
    if (result.performed) {
      expect(result.verifiedFindingCount).toBe(0);
    }
  });
});
