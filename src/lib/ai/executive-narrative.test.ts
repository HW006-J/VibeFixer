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
});
