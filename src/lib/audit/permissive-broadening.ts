import type { TableInventoryEntry } from "./build-inventory";
import { explainPermissiveBroadening, remediatePermissiveBroadening } from "./explain";
import { looksLikeTenantScopingPattern } from "./heuristics";
import { makeFinding } from "./make-finding";
import { isLiteralTrueExpression } from "./sql-expressions";
import type { ParsedPolicy, PolicyOperation } from "./parse-policy";
import { isLoginOnlyExpression, isNonNullOwnerOnlyExpression } from "./policy-patterns";
import type { AuditFinding } from "./types";

function operationsOverlap(a: PolicyOperation | null, b: PolicyOperation | null): boolean {
  const normA = a ?? "ALL";
  const normB = b ?? "ALL";
  if (normA === "ALL" || normB === "ALL") return true;
  return normA === normB;
}

function rolesOverlap(a: string[], b: string[]): boolean {
  if (a.length === 0 || b.length === 0) return true;
  const setA = new Set(a.map((role) => role.trim().toLowerCase()));
  return b.some((role) => setA.has(role.trim().toLowerCase()));
}

function isWeakOrAllowAll(expression: string): boolean {
  return isLiteralTrueExpression(expression) || isLoginOnlyExpression(expression) || isNonNullOwnerOnlyExpression(expression).matches;
}

function policyLabel(policy: ParsedPolicy): string {
  return policy.name ?? "(unnamed policy)";
}

/**
 * Detects a table where a genuine, narrow ownership policy is undermined
 * by a second, broader permissive policy with an overlapping role and
 * command — since PostgreSQL combines multiple PERMISSIVE policies for
 * the same command with OR, satisfying the broad policy alone grants
 * access regardless of the narrow one. This parser does not detect the
 * `AS RESTRICTIVE` keyword, so every policy is assumed PERMISSIVE (the
 * common case, and PostgreSQL's own default) — recorded as an explicit
 * assumption on each finding.
 */
export function detectPermissiveBroadening(table: TableInventoryEntry, repository: string): AuditFinding[] {
  const findings: AuditFinding[] = [];

  for (const narrow of table.policies) {
    if (narrow.usingExpression === null) continue;
    if (!looksLikeTenantScopingPattern(narrow.usingExpression)) continue;

    for (const broad of table.policies) {
      if (broad === narrow) continue;
      if (broad.usingExpression === null) continue;
      if (!operationsOverlap(narrow.operation, broad.operation)) continue;
      if (!rolesOverlap(narrow.roles, broad.roles)) continue;
      if (!isWeakOrAllowAll(broad.usingExpression)) continue;

      findings.push(
        makeFinding({
          id: `VIBE_PERMISSIVE_POLICY_BROADENING-${narrow.filePath}-${narrow.line}-${broad.filePath}-${broad.line}`,
          ruleId: "VIBE_PERMISSIVE_POLICY_BROADENING",
          tier: "high",
          confidence: "high",
          title: table.table
            ? `A broader permissive policy undermines a narrower one on "${table.table}"`
            : "A broader permissive policy undermines a narrower one",
          repository,
          filePath: broad.filePath,
          line: broad.usingLine ?? broad.line,
          table: table.table,
          objectType: "table",
          operation: broad.operation,
          role: broad.roles.length > 0 ? broad.roles.join(", ") : null,
          roles: broad.roles,
          evidence: `${narrow.evidence}\n\n${broad.evidence}`,
          explanation: explainPermissiveBroadening(table.table, policyLabel(narrow), policyLabel(broad)),
          remediation: remediatePermissiveBroadening(policyLabel(broad)),
          assumptions:
            "Assumes both policies are PERMISSIVE (PostgreSQL's default) — this scanner does not detect the AS RESTRICTIVE keyword.",
          clause: "USING",
          expression: broad.usingExpression,
        }),
      );
    }
  }

  return findings;
}
