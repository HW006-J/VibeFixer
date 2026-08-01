import type { SchemaInventory } from "./build-inventory";
import type { ParsedPolicy } from "./parse-policy";
import type { AuditFinding } from "./types";
import { isLiteralTrueExpression } from "./sql-expressions";
import { looksLikeTenantScopingPattern } from "./heuristics";
import { makeFinding } from "./make-finding";
import { detectPermissiveBroadening } from "./permissive-broadening";
import {
  classifyRoleExposure,
  classifyUserMetadataAuthorization,
  isLoginOnlyExpression,
  isNonNullOwnerOnlyExpression,
} from "./policy-patterns";
import {
  explainAllowAllUsing,
  explainAllowAllWithCheck,
  explainAnonAllowAll,
  explainDisabledWithPolicies,
  explainLoginOnly,
  explainNeedsReview,
  explainNonNullOwnerOnly,
  explainPublicTableRlsDisabled,
  explainUserMetadataAuthorization,
  remediateAllowAllUsing,
  remediateAllowAllWithCheck,
  remediateAnonAllowAll,
  remediateDisabledWithPolicies,
  remediateLoginOnly,
  remediateNeedsReview,
  remediateNonNullOwnerOnly,
  remediatePublicTableRlsDisabled,
  remediateUserMetadataAuthorization,
} from "./explain";

export type RuleRunResult = {
  findings: AuditFinding[];
  noIssueFoundCount: number;
};

function policyRoleLabel(policy: ParsedPolicy): string | null {
  return policy.roles.length > 0 ? policy.roles.join(", ") : null;
}

/** A table is only flagged as exposed when it's unqualified (implicit public search_path) or explicitly in the `public` schema — never a schema this scanner has no evidence is exposed. */
function isExposedSchemaTable(tableName: string): boolean {
  const parts = tableName.toLowerCase().split(".");
  if (parts.length === 1) return true;
  return parts[0] === "public";
}

type FindingContext = {
  clause: "USING" | "WITH CHECK";
  expression: string;
  table: string | null;
  operation: ParsedPolicy["operation"];
  role: string | null;
  roles: string[];
  repository: string;
  filePath: string;
  line: number;
  evidence: string;
};

/**
 * Checks for user-editable-metadata authorization independently of, and
 * before, the tenant-scoping heuristic — a genuine ownership comparison
 * (e.g. `auth.uid() = owner_id`) can be AND-combined with a risky metadata
 * check in the same expression, and the tenant-scoping heuristic's loose
 * "contains a comparison" test would otherwise treat the whole expression
 * as safe and never reach this check at all.
 */
function classifyUserMetadataFinding(ctx: FindingContext): AuditFinding | null {
  const metadataCheck = classifyUserMetadataAuthorization(ctx.expression);
  if (!metadataCheck.matches) return null;

  return makeFinding({
    id: `VIBE_USER_METADATA_AUTHORIZATION-${ctx.filePath}-${ctx.line}-${ctx.clause}`,
    ruleId: "VIBE_USER_METADATA_AUTHORIZATION",
    tier: metadataCheck.confidence === "high" ? "high" : "review",
    confidence: metadataCheck.confidence,
    title: ctx.table ? `Policy on "${ctx.table}" authorizes using user-editable metadata` : "Policy authorizes using user-editable metadata",
    repository: ctx.repository,
    filePath: ctx.filePath,
    line: ctx.line,
    table: ctx.table,
    objectType: "table",
    operation: ctx.operation,
    role: ctx.role,
    roles: ctx.roles,
    evidence: ctx.evidence,
    explanation: explainUserMetadataAuthorization(ctx.clause, ctx.table),
    remediation: remediateUserMetadataAuthorization(),
    assumptions:
      metadataCheck.confidence === "medium"
        ? "This metadata check is combined with other AND/OR logic — how much it actually weakens the policy depends on that combination, which needs human judgement."
        : null,
    clause: ctx.clause,
    expression: ctx.expression,
  });
}

/**
 * Classifies an expression that is neither the allow-all literal, a
 * user-metadata authorization risk, nor a recognised tenant-scoping
 * pattern into one of the remaining specific weak patterns (login-only,
 * non-null-owner-only) when it clearly matches one — returning null when
 * none apply, so the caller falls back to the generic "needs review"
 * finding. Unlike the metadata check, these two are only ever meant to
 * match when they are the *entire* expression, so running them after the
 * tenant-scoping heuristic (which already requires an exact-expression
 * match for these patterns to have survived to this point) is correct.
 */
function classifyRemainingWeakPattern(ctx: FindingContext): AuditFinding | null {
  if (isLoginOnlyExpression(ctx.expression)) {
    return makeFinding({
      id: `VIBE_LOGIN_ONLY_POLICY-${ctx.filePath}-${ctx.line}-${ctx.clause}`,
      ruleId: "VIBE_LOGIN_ONLY_POLICY",
      tier: "high",
      confidence: "high",
      title: ctx.table ? `Login-only policy on "${ctx.table}" has no row-ownership boundary` : "Login-only policy has no row-ownership boundary",
      repository: ctx.repository,
      filePath: ctx.filePath,
      line: ctx.line,
      table: ctx.table,
      objectType: "table",
      operation: ctx.operation,
      role: ctx.role,
      roles: ctx.roles,
      evidence: ctx.evidence,
      explanation: explainLoginOnly(ctx.clause, ctx.table),
      remediation: remediateLoginOnly(),
      clause: ctx.clause,
      expression: ctx.expression,
    });
  }

  const ownerCheck = isNonNullOwnerOnlyExpression(ctx.expression);
  if (ownerCheck.matches && ownerCheck.column) {
    return makeFinding({
      id: `VIBE_NON_NULL_OWNER_POLICY-${ctx.filePath}-${ctx.line}-${ctx.clause}`,
      ruleId: "VIBE_NON_NULL_OWNER_POLICY",
      tier: "high",
      confidence: "high",
      title: ctx.table ? `Non-null owner check on "${ctx.table}" does not prove requester ownership` : "Non-null owner check does not prove requester ownership",
      repository: ctx.repository,
      filePath: ctx.filePath,
      line: ctx.line,
      table: ctx.table,
      objectType: "table",
      operation: ctx.operation,
      role: ctx.role,
      roles: ctx.roles,
      evidence: ctx.evidence,
      explanation: explainNonNullOwnerOnly(ctx.clause, ctx.table, ownerCheck.column),
      remediation: remediateNonNullOwnerOnly(ownerCheck.column),
      clause: ctx.clause,
      expression: ctx.expression,
    });
  }

  return null;
}

/**
 * Classifies a clause expression that is not the allow-all literal:
 * user-metadata authorization first (independent of tenant-scoping, since
 * it can coexist with a real ownership comparison), then the tenant-
 * scoping heuristic (no issue found), then the remaining exact-match weak
 * patterns, then the generic needs-review fallback.
 */
function classifyNonAllowAllClause(ctx: FindingContext): { finding: AuditFinding | null; noIssueFound: boolean } {
  const metadataFinding = classifyUserMetadataFinding(ctx);
  if (metadataFinding) return { finding: metadataFinding, noIssueFound: false };

  if (looksLikeTenantScopingPattern(ctx.expression)) {
    return { finding: null, noIssueFound: true };
  }

  const specific = classifyRemainingWeakPattern(ctx);
  if (specific) return { finding: specific, noIssueFound: false };

  const genericFinding = makeFinding({
    id: `RLS_POLICY_NEEDS_REVIEW-${ctx.filePath}-${ctx.line}-${ctx.clause === "USING" ? "using" : "withcheck"}`,
    ruleId: "RLS_POLICY_NEEDS_REVIEW",
    tier: "review",
    confidence: "low",
    title: ctx.table ? `RLS policy on "${ctx.table}" needs manual review` : "RLS policy needs manual review",
    repository: ctx.repository,
    filePath: ctx.filePath,
    line: ctx.line,
    table: ctx.table,
    objectType: "table",
    operation: ctx.operation,
    role: ctx.role,
    roles: ctx.roles,
    evidence: ctx.evidence,
    explanation: explainNeedsReview(ctx.clause, ctx.table),
    remediation: remediateNeedsReview(),
    clause: ctx.clause,
    expression: ctx.expression,
  });
  return { finding: genericFinding, noIssueFound: false };
}

function evaluatePolicy(policy: ParsedPolicy, repository: string): { findings: AuditFinding[]; noIssueFoundCount: number } {
  const findings: AuditFinding[] = [];
  let noIssueFoundCount = 0;
  const role = policyRoleLabel(policy);
  const roleExposure = classifyRoleExposure(policy.roles);
  const writesApply = policy.operation === "INSERT" || policy.operation === "UPDATE" || policy.operation === "ALL" || policy.operation === null;

  // USING clause
  if (policy.usingExpression !== null) {
    const line = policy.usingLine ?? policy.line;
    if (isLiteralTrueExpression(policy.usingExpression)) {
      if (roleExposure === "public_exposed") {
        findings.push(
          makeFinding({
            id: `VIBE_ANON_ALLOW_ALL-${policy.filePath}-${line}-using`,
            ruleId: "VIBE_ANON_ALLOW_ALL",
            tier: "critical",
            confidence: "high",
            title: policy.table ? `Anonymous/public allow-all USING on "${policy.table}"` : "Anonymous/public allow-all USING detected",
            repository,
            filePath: policy.filePath,
            line,
            table: policy.table,
            objectType: "table",
            operation: policy.operation,
            role,
            roles: policy.roles,
            evidence: policy.evidence,
            explanation: explainAnonAllowAll("USING", policy.operation, policy.table),
            remediation: remediateAnonAllowAll("USING"),
            clause: "USING",
            expression: policy.usingExpression,
          }),
        );
      } else {
        findings.push(
          makeFinding({
            id: `RLS_ALLOW_ALL-${policy.filePath}-${line}`,
            ruleId: "RLS_ALLOW_ALL",
            tier: "critical",
            confidence: "high",
            title: policy.table ? `Allow-all RLS policy on "${policy.table}"` : "Allow-all RLS policy detected",
            repository,
            filePath: policy.filePath,
            line,
            table: policy.table,
            objectType: "table",
            operation: policy.operation,
            role,
            roles: policy.roles,
            evidence: policy.evidence,
            explanation: explainAllowAllUsing(policy.operation, policy.table),
            remediation: remediateAllowAllUsing(),
            clause: "USING",
            expression: policy.usingExpression,
          }),
        );
      }
    } else {
      const result = classifyNonAllowAllClause({
        clause: "USING",
        expression: policy.usingExpression,
        table: policy.table,
        operation: policy.operation,
        role,
        roles: policy.roles,
        repository,
        filePath: policy.filePath,
        line,
        evidence: policy.evidence,
      });
      if (result.finding) findings.push(result.finding);
      if (result.noIssueFound) noIssueFoundCount += 1;
    }
  }

  // WITH CHECK clause
  if (policy.withCheckExpression !== null) {
    const line = policy.withCheckLine ?? policy.line;
    if (isLiteralTrueExpression(policy.withCheckExpression) && writesApply) {
      if (roleExposure === "public_exposed") {
        findings.push(
          makeFinding({
            id: `VIBE_ANON_ALLOW_ALL-${policy.filePath}-${line}-withcheck`,
            ruleId: "VIBE_ANON_ALLOW_ALL",
            tier: "critical",
            confidence: "high",
            title: policy.table ? `Anonymous/public allow-all WITH CHECK on "${policy.table}"` : "Anonymous/public allow-all WITH CHECK detected",
            repository,
            filePath: policy.filePath,
            line,
            table: policy.table,
            objectType: "table",
            operation: policy.operation,
            role,
            roles: policy.roles,
            evidence: policy.evidence,
            explanation: explainAnonAllowAll("WITH CHECK", policy.operation, policy.table),
            remediation: remediateAnonAllowAll("WITH CHECK"),
            clause: "WITH CHECK",
            expression: policy.withCheckExpression,
          }),
        );
      } else {
        findings.push(
          makeFinding({
            id: `RLS_WITH_CHECK_ALLOW_ALL-${policy.filePath}-${line}`,
            ruleId: "RLS_WITH_CHECK_ALLOW_ALL",
            tier: "critical",
            confidence: "high",
            title: policy.table ? `Allow-all WITH CHECK on "${policy.table}"` : "Allow-all WITH CHECK detected",
            repository,
            filePath: policy.filePath,
            line,
            table: policy.table,
            objectType: "table",
            operation: policy.operation,
            role,
            roles: policy.roles,
            evidence: policy.evidence,
            explanation: explainAllowAllWithCheck(policy.operation, policy.table),
            remediation: remediateAllowAllWithCheck(),
            clause: "WITH CHECK",
            expression: policy.withCheckExpression,
          }),
        );
      }
    } else {
      const result = classifyNonAllowAllClause({
        clause: "WITH CHECK",
        expression: policy.withCheckExpression,
        table: policy.table,
        operation: policy.operation,
        role,
        roles: policy.roles,
        repository,
        filePath: policy.filePath,
        line,
        evidence: policy.evidence,
      });
      if (result.finding) findings.push(result.finding);
      if (result.noIssueFound) noIssueFoundCount += 1;
    }
  }

  return { findings, noIssueFoundCount };
}

/**
 * Runs every deterministic rule against the schema inventory. Every
 * discovered policy clause is classified into exactly one of: a critical
 * finding (a confirmed allow-all pattern), a high finding (a confirmed,
 * well-understood but narrower-scope pattern), a review finding (no
 * confirmed issue, but not a recognised safe pattern either), or "no issue
 * found" (matched a common tenant-scoping pattern and was not flagged —
 * never presented as a safety guarantee).
 */
export function runDeterministicRules(inventory: SchemaInventory, repository: string): RuleRunResult {
  const findings: AuditFinding[] = [];
  let noIssueFoundCount = 0;

  for (const table of inventory.tables.values()) {
    const hasPolicies = table.policies.length > 0;

    if (!table.rlsEnabled && hasPolicies) {
      findings.push(
        makeFinding({
          id: `RLS_DISABLED_WITH_POLICIES-${table.policies[0].filePath}-${table.table}`,
          ruleId: "RLS_DISABLED_WITH_POLICIES",
          tier: "critical",
          confidence: "high",
          title: `Row Level Security is disabled on "${table.table}" despite defined policies`,
          repository,
          filePath: table.policies[0].filePath,
          line: table.policies[0].line,
          table: table.table,
          objectType: "table",
          evidence: table.policies.map((p) => p.evidence).join("\n\n"),
          explanation: explainDisabledWithPolicies(table.table, table.policies.length),
          remediation: remediateDisabledWithPolicies(table.table),
        }),
      );
    } else if (!table.rlsEnabled && !hasPolicies && isExposedSchemaTable(table.table)) {
      if (table.createdAt) {
        findings.push(
          makeFinding({
            id: `VIBE_PUBLIC_TABLE_RLS_DISABLED-${table.createdAt.filePath}-${table.table}`,
            ruleId: "VIBE_PUBLIC_TABLE_RLS_DISABLED",
            tier: "critical",
            confidence: "high",
            title: `"${table.table}" is exposed without Row Level Security`,
            repository,
            filePath: table.createdAt.filePath,
            line: table.createdAt.line,
            table: table.table,
            objectType: "table",
            evidence: `CREATE TABLE ${table.table} — no ENABLE ROW LEVEL SECURITY statement was found for this table in the scanned migrations.`,
            explanation: explainPublicTableRlsDisabled(table.table),
            remediation: remediatePublicTableRlsDisabled(table.table),
            assumptions:
              "Assumes this table's schema is exposed through Supabase's Data API (the default for the public schema) and that no migration outside the scanned files already enabled RLS.",
          }),
        );
      } else if (table.rlsChanges.length > 0) {
        const lastChange = table.rlsChanges[table.rlsChanges.length - 1];
        findings.push(
          makeFinding({
            id: `VIBE_PUBLIC_TABLE_RLS_DISABLED-${lastChange.filePath}-${table.table}-review`,
            ruleId: "VIBE_PUBLIC_TABLE_RLS_DISABLED",
            tier: "review",
            confidence: "low",
            title: `"${table.table}" appears exposed without Row Level Security, but its creation was not found in scanned migrations`,
            repository,
            filePath: lastChange.filePath,
            line: lastChange.line,
            table: table.table,
            objectType: "table",
            evidence: `RLS was explicitly ${lastChange.enabled ? "enabled" : "disabled"} for ${table.table} here, but no CREATE TABLE statement for it was found in the scanned migrations.`,
            explanation: `${explainPublicTableRlsDisabled(table.table)} Repository state is incomplete — this table's CREATE TABLE statement was not found in the scanned migrations, so its full schema and history cannot be confirmed.`,
            remediation: remediatePublicTableRlsDisabled(table.table),
            assumptions:
              "This table's CREATE TABLE statement was not among the scanned migrations (it may predate them or live outside supabase/migrations), so this is reported as needing review rather than a confirmed finding.",
          }),
        );
      }
    }

    for (const policy of table.policies) {
      const result = evaluatePolicy(policy, repository);
      findings.push(...result.findings);
      noIssueFoundCount += result.noIssueFoundCount;
    }

    findings.push(...detectPermissiveBroadening(table, repository));
  }

  return { findings, noIssueFoundCount };
}
