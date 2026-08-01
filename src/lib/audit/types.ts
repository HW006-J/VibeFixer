export type AuditRuleId =
  | "RLS_ALLOW_ALL"
  | "RLS_WITH_CHECK_ALLOW_ALL"
  | "RLS_DISABLED_WITH_POLICIES"
  | "RLS_POLICY_NEEDS_REVIEW"
  | "VIBE_PUBLIC_TABLE_RLS_DISABLED"
  | "VIBE_ANON_ALLOW_ALL"
  | "VIBE_LOGIN_ONLY_POLICY"
  | "VIBE_NON_NULL_OWNER_POLICY"
  | "VIBE_USER_METADATA_AUTHORIZATION"
  | "VIBE_PERMISSIVE_POLICY_BROADENING"
  | "VIBE_SECURITY_DEFINER_SEARCH_PATH"
  | "VIBE_SECURITY_DEFINER_VIEW"
  // Non-SQL families. These are static-only: none of them can be proven by
  // execution the way the RLS leak can, so they never set
  // liveValidationAvailable.
  | "VIBE_FIREBASE_PUBLIC_RULE"
  | "VIBE_FIREBASE_AUTH_ONLY_RULE";

/**
 * "critical" = a confirmed deterministic pattern with the clearest possible
 * evidence (e.g. a literal allow-all clause). "high" = a confirmed
 * deterministic pattern that is a real, well-understood risk but slightly
 * narrower in scope or dependent on an unverified assumption (e.g. grants).
 * "review" = the scanner could not classify it and a human (or the optional
 * AI pass) should look.
 */
export type AuditFindingTier = "critical" | "high" | "review";

export type AuditFindingConfidence = "high" | "medium" | "low";

/**
 * `table` / `view` / `function` are SQL schema objects. `config` covers
 * non-SQL policy and configuration files (e.g. Firebase rules), where the
 * finding is about a declaration rather than a database object.
 */
export type AuditFindingObjectType = "table" | "view" | "function" | "config";

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
  /** How confident the scanner is in this specific classification, independent of tier. */
  confidence: AuditFindingConfidence;
  title: string;
  repository: string;
  filePath: string;
  line: number;
  /** End of the relevant evidence range, when it spans more than one line (e.g. a function/view body). Null when the finding is effectively single-line. */
  endLine: number | null;
  /** The table this finding is about. For view/function findings, this is null — see `objectType`/the object name embedded in `title`/`evidence` instead. */
  table: string | null;
  /** What kind of schema object this finding concerns. Null for legacy pre-existing rules that predate this field (always effectively "table"). */
  objectType: AuditFindingObjectType | null;
  operation: string | null;
  /** Single display label for the role(s) this finding applies to (comma-joined). Kept for backward compatibility — prefer `roles`. */
  role: string | null;
  /** The individual roles this finding applies to. Empty array means the policy omitted TO <role>, which PostgreSQL treats as PUBLIC. */
  roles: string[];
  /** Exact, redacted (never containing secrets) evidence text from the source. */
  evidence: string;
  explanation: string;
  /** A concise, actionable fix recommendation, separate from `explanation`'s description of the problem. */
  remediation: string;
  /** Any assumption the scanner had to make to reach this classification (e.g. "assumes this table's schema is exposed via the Data API"). Null when no material assumption was needed. */
  assumptions: string | null;
  /** True only for the one specific finding the live-validation flow actually exercises against the authorised demo database. Never true for statically-only-detected new rules. */
  liveValidationAvailable: boolean;
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
  /** Findings at tier "high" — a real, confirmed risk, but not the clearest-possible-evidence tier. */
  highRiskFindingCount: number;
  needsReviewCount: number;
  /** Policies (or clauses) that matched a common tenant-scoping pattern and were not flagged. Not a safety guarantee — see product disclaimer. */
  noIssueFoundCount: number;
  aiReviewsPerformed: number;
  tables: TableCoverageSummary[];
};

export type SecurityRiskLevel = "critical" | "high" | "moderate" | "low" | "none";

/**
 * A deterministic, always-available executive summary of one scan. Every
 * field is derived directly from the real AuditReport/live-validation
 * result that produced it — never a separate model call, and never a
 * value that isn't traceable to a real count or a real finding.
 */
export type SecuritySummary = {
  riskLevel: SecurityRiskLevel;
  criticalCount: number;
  highCount: number;
  needsReviewCount: number;
  policiesChecked: number;
  tablesChecked: number;
  checksRun: number;
  /** Up to 3 short, plain-English risk statements, most severe first. Empty when nothing was flagged. */
  topRisks: string[];
  liveVerification: {
    /** True only when a real live-validation call actually ran and returned a result for this scan session. */
    performed: boolean;
    /** Present only when performed is true. A short, real-evidence sentence, e.g. "Confirmed — 2 cross-tenant rows exposed." */
    summary: string | null;
  };
  /** A single, concrete recommended next step, or null when there is nothing to recommend (no findings). */
  recommendedNextStep: string | null;
};

export type AuditReport = {
  repository: string;
  isDemoRepository: boolean;
  findings: AuditFinding[];
  coverage: AuditCoverage;
  durationMs: number;
};
