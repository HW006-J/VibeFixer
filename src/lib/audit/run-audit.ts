import { buildSchemaInventory } from "./build-inventory";
import { runDeterministicRules } from "./run-rules";
import { evaluateSecurityDefinerFunctions, evaluateSecurityDefinerViews } from "./security-definer-rules";
import type { AuditCoverage, AuditReport, TableCoverageSummary } from "./types";
import type { ScannedFile } from "../scanner/types";
import {
  isAiSemanticReviewAvailable,
  MAX_AI_REVIEWS_PER_SCAN,
  reviewPolicyClauseSemantically,
} from "../ai/semantic-review";

/**
 * The one table the live-validation flow actually queries (must match
 * REPAIR_TARGET_TABLE in src/lib/repair/trusted-repair.ts). Duplicated
 * here as a plain constant, rather than importing across into the repair
 * module, to keep the static audit engine free of any dependency on the
 * live-demo-specific repair machinery.
 */
const LIVE_VALIDATION_TARGET_TABLE = "public.clients";

function normaliseTableName(name: string): string {
  return name.replace(/"/g, "").trim().toLowerCase();
}

/**
 * Runs the full audit pipeline: discover SQL statements → build the schema
 * and RLS inventory → run deterministic rules → optionally send review-tier
 * findings for a real AI semantic opinion (only when GEMINI_API_KEY is
 * configured, capped, and only ever attached when a real call succeeded).
 */
export async function runAudit(
  repository: string,
  isDemoRepository: boolean,
  files: ScannedFile[],
): Promise<AuditReport> {
  const startedAt = Date.now();

  const inventory = buildSchemaInventory(files);
  const { findings, noIssueFoundCount } = runDeterministicRules(inventory, repository);
  findings.push(...evaluateSecurityDefinerFunctions(inventory.functions, repository));
  findings.push(...evaluateSecurityDefinerViews(inventory.views, inventory.tables, repository));

  let aiReviewsPerformed = 0;
  if (isAiSemanticReviewAvailable()) {
    const reviewFindings = findings.filter((f) => f.ruleId === "RLS_POLICY_NEEDS_REVIEW");
    for (const finding of reviewFindings.slice(0, MAX_AI_REVIEWS_PER_SCAN)) {
      if (!finding.clause || finding.expression === null) continue;

      const result = await reviewPolicyClauseSemantically({
        clause: finding.clause,
        table: finding.table,
        operation: finding.operation,
        role: finding.role,
        expression: finding.expression,
        evidence: finding.evidence,
      });

      if (result.performed) {
        finding.aiReview = result;
        aiReviewsPerformed += 1;
      }
    }
  }

  // Live validation only ever exercises one fixed table on the one
  // authorised demo repository — never inferred as "available" for any
  // other finding, table, or repository.
  if (isDemoRepository) {
    for (const finding of findings) {
      if (finding.table && normaliseTableName(finding.table) === LIVE_VALIDATION_TARGET_TABLE) {
        finding.liveValidationAvailable = true;
      }
    }
  }

  const tables: TableCoverageSummary[] = Array.from(inventory.tables.values()).map((table) => ({
    table: table.table,
    rlsEnabled: table.rlsEnabled,
    policyCount: table.policies.length,
  }));

  const coverage: AuditCoverage = {
    filesScanned: files.map((file) => file.path),
    statementsInspected: inventory.statementsInspected,
    policiesInspected: inventory.policiesInspected,
    tablesDiscovered: inventory.tables.size,
    criticalFindingCount: findings.filter((f) => f.tier === "critical").length,
    highRiskFindingCount: findings.filter((f) => f.tier === "high").length,
    needsReviewCount: findings.filter((f) => f.tier === "review").length,
    noIssueFoundCount,
    aiReviewsPerformed,
    tables,
  };

  return {
    repository,
    isDemoRepository,
    findings,
    coverage,
    durationMs: Date.now() - startedAt,
  };
}
