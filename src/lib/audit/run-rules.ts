import type { SchemaInventory } from "./build-inventory";
import type { ParsedPolicy } from "./parse-policy";
import type { AuditFinding } from "./types";
import { isLiteralTrueExpression } from "./sql-expressions";
import { looksLikeTenantScopingPattern } from "./heuristics";
import {
  explainAllowAllUsing,
  explainAllowAllWithCheck,
  explainDisabledWithPolicies,
  explainNeedsReview,
} from "./explain";

export type RuleRunResult = {
  findings: AuditFinding[];
  noIssueFoundCount: number;
};

function policyRoleLabel(policy: ParsedPolicy): string | null {
  return policy.roles.length > 0 ? policy.roles.join(", ") : null;
}

function evaluatePolicy(policy: ParsedPolicy, repository: string): { findings: AuditFinding[]; noIssueFoundCount: number } {
  const findings: AuditFinding[] = [];
  let noIssueFoundCount = 0;
  const role = policyRoleLabel(policy);
  const writesApply = policy.operation === "INSERT" || policy.operation === "UPDATE" || policy.operation === "ALL" || policy.operation === null;

  // USING clause
  if (policy.usingExpression !== null) {
    if (isLiteralTrueExpression(policy.usingExpression)) {
      findings.push({
        id: `RLS_ALLOW_ALL-${policy.filePath}-${policy.usingLine}`,
        ruleId: "RLS_ALLOW_ALL",
        tier: "critical",
        title: policy.table ? `Allow-all RLS policy on "${policy.table}"` : "Allow-all RLS policy detected",
        repository,
        filePath: policy.filePath,
        line: policy.usingLine ?? policy.line,
        table: policy.table,
        operation: policy.operation,
        role,
        evidence: policy.evidence,
        explanation: explainAllowAllUsing(policy.operation, policy.table),
        clause: "USING",
        expression: policy.usingExpression,
        aiReview: null,
      });
    } else if (looksLikeTenantScopingPattern(policy.usingExpression)) {
      noIssueFoundCount += 1;
    } else {
      findings.push({
        id: `RLS_POLICY_NEEDS_REVIEW-${policy.filePath}-${policy.usingLine}-using`,
        ruleId: "RLS_POLICY_NEEDS_REVIEW",
        tier: "review",
        title: policy.table ? `RLS policy on "${policy.table}" needs manual review` : "RLS policy needs manual review",
        repository,
        filePath: policy.filePath,
        line: policy.usingLine ?? policy.line,
        table: policy.table,
        operation: policy.operation,
        role,
        evidence: policy.evidence,
        explanation: explainNeedsReview("USING", policy.table),
        clause: "USING",
        expression: policy.usingExpression,
        aiReview: null,
      });
    }
  }

  // WITH CHECK clause
  if (policy.withCheckExpression !== null) {
    if (isLiteralTrueExpression(policy.withCheckExpression) && writesApply) {
      findings.push({
        id: `RLS_WITH_CHECK_ALLOW_ALL-${policy.filePath}-${policy.withCheckLine}`,
        ruleId: "RLS_WITH_CHECK_ALLOW_ALL",
        tier: "critical",
        title: policy.table ? `Allow-all WITH CHECK on "${policy.table}"` : "Allow-all WITH CHECK detected",
        repository,
        filePath: policy.filePath,
        line: policy.withCheckLine ?? policy.line,
        table: policy.table,
        operation: policy.operation,
        role,
        evidence: policy.evidence,
        explanation: explainAllowAllWithCheck(policy.operation, policy.table),
        clause: "WITH CHECK",
        expression: policy.withCheckExpression,
        aiReview: null,
      });
    } else if (looksLikeTenantScopingPattern(policy.withCheckExpression)) {
      noIssueFoundCount += 1;
    } else {
      findings.push({
        id: `RLS_POLICY_NEEDS_REVIEW-${policy.filePath}-${policy.withCheckLine}-withcheck`,
        ruleId: "RLS_POLICY_NEEDS_REVIEW",
        tier: "review",
        title: policy.table ? `RLS policy on "${policy.table}" needs manual review` : "RLS policy needs manual review",
        repository,
        filePath: policy.filePath,
        line: policy.withCheckLine ?? policy.line,
        table: policy.table,
        operation: policy.operation,
        role,
        evidence: policy.evidence,
        explanation: explainNeedsReview("WITH CHECK", policy.table),
        clause: "WITH CHECK",
        expression: policy.withCheckExpression,
        aiReview: null,
      });
    }
  }

  return { findings, noIssueFoundCount };
}

/**
 * Runs every deterministic rule against the schema inventory. Every
 * discovered policy clause is classified into exactly one of: a critical
 * finding (a confirmed allow-all pattern), a review finding (no confirmed
 * issue, but not a recognised safe pattern either), or "no issue found"
 * (matched a common tenant-scoping pattern and was not flagged — never
 * presented as a safety guarantee).
 */
export function runDeterministicRules(inventory: SchemaInventory, repository: string): RuleRunResult {
  const findings: AuditFinding[] = [];
  let noIssueFoundCount = 0;

  for (const table of inventory.tables.values()) {
    if (!table.rlsEnabled && table.policies.length > 0) {
      findings.push({
        id: `RLS_DISABLED_WITH_POLICIES-${table.policies[0].filePath}-${table.table}`,
        ruleId: "RLS_DISABLED_WITH_POLICIES",
        tier: "critical",
        title: `Row Level Security is disabled on "${table.table}" despite defined policies`,
        repository,
        filePath: table.policies[0].filePath,
        line: table.policies[0].line,
        table: table.table,
        operation: null,
        role: null,
        evidence: table.policies.map((p) => p.evidence).join("\n\n"),
        explanation: explainDisabledWithPolicies(table.table, table.policies.length),
        clause: null,
        expression: null,
        aiReview: null,
      });
    }

    for (const policy of table.policies) {
      const result = evaluatePolicy(policy, repository);
      findings.push(...result.findings);
      noIssueFoundCount += result.noIssueFoundCount;
    }
  }

  return { findings, noIssueFoundCount };
}
