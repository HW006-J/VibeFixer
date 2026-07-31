export type AuditRuleId =
  | "RLS_ALLOW_ALL"
  | "RLS_WITH_CHECK_ALLOW_ALL"
  | "RLS_DISABLED_WITH_POLICIES"
  | "RLS_POLICY_NEEDS_REVIEW";

/** "critical" = a confirmed deterministic pattern. "review" = the scanner could not classify it and a human (or the optional AI pass) should look. */
export type AuditFindingTier = "critical" | "review";

export type AiReviewAssessment = "likely_safe" | "likely_unsafe" | "uncertain";

export type AiSemanticReview = {
  performed: true;
  assessment: AiReviewAssessment;
  reasoning: string;
  model: string;
};

export type AuditFinding = {
  id: string;
  ruleId: AuditRuleId;
  tier: AuditFindingTier;
  title: string;
  repository: string;
  filePath: string;
  line: number;
  table: string | null;
  operation: string | null;
  role: string | null;
  evidence: string;
  explanation: string;
  /** The specific clause this finding is about, when applicable. */
  clause: "USING" | "WITH CHECK" | null;
  /** The raw clause expression this finding is about, when applicable. */
  expression: string | null;
  /** Only present when a real model call was made for this finding. Never fabricated. */
  aiReview: AiSemanticReview | null;
};

export type TableCoverageSummary = {
  table: string;
  rlsEnabled: boolean;
  policyCount: number;
};

export type AuditCoverage = {
  filesScanned: string[];
  statementsInspected: number;
  policiesInspected: number;
  tablesDiscovered: number;
  criticalFindingCount: number;
  needsReviewCount: number;
  /** Policies (or clauses) that matched a common tenant-scoping pattern and were not flagged. Not a safety guarantee — see product disclaimer. */
  noIssueFoundCount: number;
  aiReviewsPerformed: number;
  tables: TableCoverageSummary[];
};

export type AuditReport = {
  repository: string;
  isDemoRepository: boolean;
  findings: AuditFinding[];
  coverage: AuditCoverage;
  durationMs: number;
};
