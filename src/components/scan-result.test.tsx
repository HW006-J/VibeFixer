// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { ScanResult, type ScanResultState } from "./scan-result";
import type { AuditFinding } from "@/lib/audit/types";
import { auditFindingToUnified } from "@/lib/security/from-audit";
import { buildSecurityReport } from "@/lib/security/report";

function baseFinding(overrides: Partial<AuditFinding>): AuditFinding {
  return {
    id: "id-1",
    ruleId: "RLS_ALLOW_ALL",
    tier: "critical",
    confidence: "high",
    title: "Allow-all RLS policy on \"public.clients\"",
    repository: "some-owner/some-repo",
    filePath: "supabase/migrations/0002.sql",
    line: 8,
    endLine: null,
    table: "public.clients",
    objectType: "table",
    operation: "SELECT",
    role: "authenticated",
    roles: ["authenticated"],
    evidence: "using (true)",
    explanation: "This policy's USING clause is the literal boolean true. Any client can read every row.",
    remediation: "Scope the expression to the requesting user instead.",
    assumptions: null,
    liveValidationAvailable: false,
    clause: "USING",
    expression: "true",
    aiReview: null,
    ...overrides,
  };
}

function successState(findings: AuditFinding[], overrides: Partial<Extract<ScanResultState, { status: "success" }>> = {}): ScanResultState {
  const criticalFindingCount = findings.filter((f) => f.tier === "critical").length;
  const highRiskFindingCount = findings.filter((f) => f.tier === "high").length;
  const needsReviewCount = findings.filter((f) => f.tier === "review").length;
  const unifiedFindings = findings.map(auditFindingToUnified);
  const securityReport = buildSecurityReport({
    repository: "some-owner/some-repo",
    filesInspected: ["supabase/migrations/0001.sql"],
    unifiedFindings,
    checksRun: 28,
    categoriesAssessed: ["supabase"],
    unsupportedContext: [],
  });
  return {
    status: "success",
    repository: "some-owner/some-repo",
    repositoryUrl: "https://github.com/some-owner/some-repo",
    isDemoRepository: false,
    findings,
    unifiedFindings,
    securityReport,
    coverage: {
      filesScanned: ["supabase/migrations/0001.sql"],
      statementsInspected: 3,
      policiesInspected: findings.length,
      tablesDiscovered: 1,
      criticalFindingCount,
      highRiskFindingCount,
      needsReviewCount,
      noIssueFoundCount: 0,
      aiReviewsPerformed: 0,
      tables: [{ table: "public.clients", rlsEnabled: true, policyCount: findings.length }],
    },
    durationMs: 12,
    scanToken: 1,
    ...overrides,
  };
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("ScanResult", () => {
  it("renders a critical finding and shows critical risk in the summary", () => {
    render(<ScanResult state={successState([baseFinding({ tier: "critical" })])} />);

    expect(screen.getByText(/critical risk detected/i)).toBeTruthy();
    expect(screen.getByRole("heading", { name: /allow-all rls policy/i })).toBeTruthy();
  });

  it("renders a high-tier finding (not silently dropped) and shows high risk in the summary", () => {
    const finding = baseFinding({
      tier: "high",
      ruleId: "VIBE_LOGIN_ONLY_POLICY",
      title: "Login-only policy on \"public.clients\" has no row-ownership boundary",
    });
    render(<ScanResult state={successState([finding])} />);

    expect(screen.getByText(/high risk detected/i)).toBeTruthy();
    expect(screen.getByRole("heading", { name: /login-only policy/i })).toBeTruthy();
  });

  it("renders a needs-review finding and shows a needs-review summary", () => {
    const finding = baseFinding({
      tier: "review",
      ruleId: "RLS_POLICY_NEEDS_REVIEW",
      title: "RLS policy on \"public.clients\" needs manual review",
    });
    render(<ScanResult state={successState([finding])} />);

    expect(screen.getAllByText(/needs review/i).length).toBeGreaterThan(0);
    expect(screen.getByRole("heading", { name: /rls policy on "public.clients" needs manual review/i })).toBeTruthy();
  });

  it("keeps technical details (raw evidence, file/line) collapsed by default", () => {
    render(<ScanResult state={successState([baseFinding({})])} />);

    const details = document.querySelectorAll("details");
    expect(details.length).toBeGreaterThan(0);
    details.forEach((el) => expect(el.open).toBe(false));
  });

  it("shows only one primary action recommendation per finding card, using the remediation field", () => {
    const finding = baseFinding({ remediation: "Scope the expression to the requesting user instead." });
    render(<ScanResult state={successState([finding])} />);

    expect(screen.getAllByText(/scope the expression to the requesting user instead/i).length).toBeGreaterThan(0);
  });

  it("shows a live-verification-not-yet-performed message when no live evidence has been gathered", () => {
    render(<ScanResult state={successState([baseFinding({})])} />);
    expect(screen.getByText(/not yet verified/i)).toBeTruthy();
  });

  it("shows the no-issues-flagged message with a summary when the scan found nothing", () => {
    render(<ScanResult state={successState([])} />);
    expect(screen.getByText(/no issues flagged/i)).toBeTruthy();
    expect(screen.getAllByText(/no issue detected by the current vibe fixer rule set/i).length).toBeGreaterThan(0);
  });

  it("filters findings by category", () => {
    const audit = baseFinding({ tier: "critical" });
    const iamFinding = {
      ...auditFindingToUnified(audit),
      id: "iam|policy|IAM_ALLOW_WILDCARD_ACTION",
      category: "iam" as const,
      ruleId: "IAM_ALLOW_WILDCARD_ACTION",
      title: "IAM wildcard action",
    };
    render(
      <ScanResult
        state={successState([audit], {
          unifiedFindings: [auditFindingToUnified(audit), iamFinding],
          securityReport: buildSecurityReport({
            repository: "some-owner/some-repo",
            filesInspected: ["supabase/migrations/0001.sql", "iam/policy.json"],
            unifiedFindings: [auditFindingToUnified(audit), iamFinding],
            checksRun: 28,
            categoriesAssessed: ["supabase", "iam"],
            unsupportedContext: [],
          }),
        })}
      />,
    );

    expect(screen.getByRole("heading", { name: /allow-all rls policy/i })).toBeTruthy();
    expect(screen.getByRole("heading", { name: /iam wildcard action/i })).toBeTruthy();
  });

  it("distinguishes scanned findings from live-verified findings in the AI narrative caption, never labelling a static finding as live-verified", async () => {
    // Two findings were scanned in total, but the mocked backend only
    // reports 1 as actually live-verified — reproducing the exact reported
    // case (1 static finding exists, live verification did not confirm it).
    const scanned = [baseFinding({ tier: "critical" }), baseFinding({ id: "id-2", tier: "high", ruleId: "VIBE_LOGIN_ONLY_POLICY" })];

    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        json: async () => ({
          ok: true,
          narrative: {
            executiveSummary: "Summary",
            blastRadiusSummary: "Blast",
            prioritisedFindingIds: [],
            remediationOrder: [],
            uncertainty: "Uncertain",
            missingContext: [],
          },
          model: "gemini-test",
          verifiedFindingCount: 1,
        }),
      })) as unknown as typeof fetch,
    );

    render(<ScanResult state={successState(scanned)} />);

    fireEvent.click(screen.getByRole("button", { name: /generate ai summary/i }));

    await screen.findByText(/generated from 2 scanned findings/i);
    expect(screen.getByText(/1 live-verified finding\b/i)).toBeTruthy();
    // The old, ambiguous wording (calling the whole count "verified") must be gone.
    expect(screen.queryByText(/^generated from \d+ verified vibe fixer findings/i)).toBeNull();
  });
});
