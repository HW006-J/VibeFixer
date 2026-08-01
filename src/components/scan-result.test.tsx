// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { ScanResult, type ScanResultState } from "./scan-result";
import type { AuditFinding } from "@/lib/audit/types";

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
  return {
    status: "success",
    repository: "some-owner/some-repo",
    repositoryUrl: "https://github.com/some-owner/some-repo",
    isDemoRepository: false,
    findings,
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
    expect(screen.getByText(/no known issues detected/i)).toBeTruthy();
  });
});
