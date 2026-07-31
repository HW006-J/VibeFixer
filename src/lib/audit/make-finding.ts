import type { AuditFinding, AuditFindingConfidence, AuditFindingObjectType, AuditFindingTier, AuditRuleId } from "./types";

/**
 * Constructs a fully-populated AuditFinding, filling in sensible defaults
 * (liveValidationAvailable: false, aiReview: null, empty roles, etc.) for
 * the fields most call sites don't need to set explicitly. Every rule
 * module uses this so a new required field only ever needs a default set
 * in one place.
 */
export function makeFinding(input: {
  id: string;
  ruleId: AuditRuleId;
  tier: AuditFindingTier;
  confidence: AuditFindingConfidence;
  title: string;
  repository: string;
  filePath: string;
  line: number;
  endLine?: number | null;
  table?: string | null;
  objectType?: AuditFindingObjectType | null;
  operation?: string | null;
  role?: string | null;
  roles?: string[];
  evidence: string;
  explanation: string;
  remediation: string;
  assumptions?: string | null;
  clause?: "USING" | "WITH CHECK" | null;
  expression?: string | null;
}): AuditFinding {
  return {
    id: input.id,
    ruleId: input.ruleId,
    tier: input.tier,
    confidence: input.confidence,
    title: input.title,
    repository: input.repository,
    filePath: input.filePath,
    line: input.line,
    endLine: input.endLine ?? null,
    table: input.table ?? null,
    objectType: input.objectType ?? null,
    operation: input.operation ?? null,
    role: input.role ?? null,
    roles: input.roles ?? [],
    evidence: input.evidence,
    explanation: input.explanation,
    remediation: input.remediation,
    assumptions: input.assumptions ?? null,
    liveValidationAvailable: false,
    clause: input.clause ?? null,
    expression: input.expression ?? null,
    aiReview: null,
  };
}
