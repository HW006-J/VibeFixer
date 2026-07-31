import type { AuditFinding, AuditFindingTier, AuditReport, SecurityRiskLevel, SecuritySummary } from "./types";

/**
 * Every rule ID this scanner can currently produce. Kept as a plain array
 * (rather than derived from the AuditRuleId union, which TypeScript can't
 * enumerate at runtime) so "checks run" in the summary reflects the real
 * size of the rule pack — update this alongside AuditRuleId in types.ts.
 */
const ALL_RULE_IDS = [
  "RLS_ALLOW_ALL",
  "RLS_WITH_CHECK_ALLOW_ALL",
  "RLS_DISABLED_WITH_POLICIES",
  "RLS_POLICY_NEEDS_REVIEW",
  "VIBE_PUBLIC_TABLE_RLS_DISABLED",
  "VIBE_ANON_ALLOW_ALL",
  "VIBE_LOGIN_ONLY_POLICY",
  "VIBE_NON_NULL_OWNER_POLICY",
  "VIBE_USER_METADATA_AUTHORIZATION",
  "VIBE_PERMISSIVE_POLICY_BROADENING",
  "VIBE_SECURITY_DEFINER_SEARCH_PATH",
  "VIBE_SECURITY_DEFINER_VIEW",
] as const;

const TIER_PRIORITY: Record<AuditFindingTier, number> = { critical: 0, high: 1, review: 2 };

function computeRiskLevel(report: AuditReport): SecurityRiskLevel {
  const { criticalFindingCount, highRiskFindingCount, needsReviewCount, policiesInspected, tablesDiscovered } = report.coverage;
  if (criticalFindingCount > 0) return "critical";
  if (highRiskFindingCount > 0) return "high";
  if (needsReviewCount > 0) return "moderate";
  if (policiesInspected > 0 || tablesDiscovered > 0) return "low";
  return "none";
}

function sortBySeverity(findings: AuditFinding[]): AuditFinding[] {
  return [...findings].sort((a, b) => TIER_PRIORITY[a.tier] - TIER_PRIORITY[b.tier]);
}

/** Real evidence from a live-validation/live-state check, when one has actually run in this session. Never fabricated or assumed. */
export type LiveVerificationEvidence = {
  totalRowsReturned: number;
  ownRowCount: number;
  leakedRowCount: number;
};

/**
 * Deterministically derives the executive summary from a real AuditReport
 * (and, when available, real live-verification evidence gathered
 * separately after the scan — live validation is a distinct, later step in
 * the flow, so it is never assumed at scan time). No model call is
 * involved: every field here is a direct read or simple aggregation of
 * numbers and text that already exist on the report/evidence.
 */
export function computeSecuritySummary(report: AuditReport, liveEvidence?: LiveVerificationEvidence | null): SecuritySummary {
  const { coverage, findings } = report;
  const sorted = sortBySeverity(findings);
  const topRisks = sorted.slice(0, 3).map((finding) => finding.title);

  const liveVerification: SecuritySummary["liveVerification"] = liveEvidence
    ? {
        performed: true,
        summary:
          liveEvidence.leakedRowCount > 0
            ? `Confirmed — ${liveEvidence.leakedRowCount} cross-tenant row${liveEvidence.leakedRowCount === 1 ? "" : "s"} exposed.`
            : `Confirmed protected — 0 cross-tenant rows exposed (${liveEvidence.ownRowCount} own row${liveEvidence.ownRowCount === 1 ? "" : "s"} returned).`,
      }
    : { performed: false, summary: null };

  return {
    riskLevel: computeRiskLevel(report),
    criticalCount: coverage.criticalFindingCount,
    highCount: coverage.highRiskFindingCount,
    needsReviewCount: coverage.needsReviewCount,
    policiesChecked: coverage.policiesInspected,
    tablesChecked: coverage.tablesDiscovered,
    checksRun: ALL_RULE_IDS.length,
    topRisks,
    liveVerification,
    recommendedNextStep: sorted[0]?.remediation ?? null,
  };
}
