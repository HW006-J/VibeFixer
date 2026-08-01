export type SecurityCategory = "supabase" | "iam" | "secret" | "endpoint";

export type UnifiedSeverity = "critical" | "high" | "medium" | "review";

export type UnifiedConfidence = "high" | "medium" | "low";

export type FindingVerification = "static" | "live_verified" | "needs_review";

export type UnifiedFinding = {
  id: string;
  ruleId: string;
  category: SecurityCategory;
  severity: UnifiedSeverity;
  confidence: UnifiedConfidence;
  title: string;
  impact: string;
  recommendation: string;
  filePath: string;
  startLine: number;
  endLine: number;
  redactedEvidence: string;
  assumptions: string | null;
  verification: FindingVerification;
  /** Supabase-only: whether live validation can exercise this finding on the demo database. */
  liveValidationAvailable?: boolean;
};

export function stableFindingId(segments: string[]): string {
  return segments.map((s) => s.replace(/\|/g, "_")).join("|");
}

export function mapAuditTierToSeverity(tier: "critical" | "high" | "review"): UnifiedSeverity {
  if (tier === "review") return "review";
  return tier;
}
