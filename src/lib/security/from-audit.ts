import type { AuditFinding } from "@/lib/audit/types";
import { mapAuditTierToSeverity, stableFindingId, type UnifiedFinding } from "./finding";

export function auditFindingToUnified(finding: AuditFinding): UnifiedFinding {
  return {
    id: stableFindingId(["supabase", finding.id]),
    ruleId: finding.ruleId,
    category: "supabase",
    severity: mapAuditTierToSeverity(finding.tier),
    confidence: finding.confidence,
    title: finding.title,
    impact: finding.explanation,
    recommendation: finding.remediation,
    filePath: finding.filePath,
    startLine: finding.line,
    endLine: finding.endLine ?? finding.line,
    redactedEvidence: finding.evidence,
    assumptions: finding.assumptions,
    verification: finding.tier === "review" ? "needs_review" : "static",
    liveValidationAvailable: finding.liveValidationAvailable,
  };
}

export function auditFindingsToUnified(findings: AuditFinding[]): UnifiedFinding[] {
  return findings.map(auditFindingToUnified);
}
