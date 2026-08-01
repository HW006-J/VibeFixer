import { normaliseExpression } from "../audit/sql-expressions";

/**
 * The one known vulnerable policy this demo can repair and reset, and the
 * one trusted replacement for it. These are the only two SQL statements
 * this module will ever execute — both are fixed, code-reviewed constants.
 * Nothing derived from a request body, an AI response, or any other
 * external input is ever interpolated into SQL here. This satisfies
 * AGENTS.md: "never execute unrestricted model-generated SQL" and
 * "applies only a trusted predefined policy change".
 */
export const REPAIR_TARGET_TABLE = "public.clients";
export const REPAIR_TARGET_POLICY_NAME = "Authenticated trainers can view clients";
export const REPAIR_TARGET_OPERATION = "SELECT";
export const REPAIR_TARGET_ROLE = "authenticated";
export const REPAIR_TARGET_OWNER_COLUMN = "trainer_id";

/** The expression a proposal must (semantically) match to be considered a valid, applicable repair. */
export const TRUSTED_REPAIR_EXPRESSION = `auth.uid() = ${REPAIR_TARGET_OWNER_COLUMN}`;

export const VULNERABLE_EXPRESSION = "true";

const DROP_POLICY_SQL = `drop policy if exists "${REPAIR_TARGET_POLICY_NAME}" on ${REPAIR_TARGET_TABLE};`;

/** The exact, fixed SQL applied when a human approves the repair. */
export const REPAIR_SQL = `${DROP_POLICY_SQL}
create policy "${REPAIR_TARGET_POLICY_NAME}" on ${REPAIR_TARGET_TABLE} for select to ${REPAIR_TARGET_ROLE} using (${TRUSTED_REPAIR_EXPRESSION});`;

/** The exact, fixed SQL that restores the original vulnerable demo state. */
export const RESET_SQL = `${DROP_POLICY_SQL}
create policy "${REPAIR_TARGET_POLICY_NAME}" on ${REPAIR_TARGET_TABLE} for select to ${REPAIR_TARGET_ROLE} using (${VULNERABLE_EXPRESSION});`;

/**
 * Checks whether an AI-proposed expression is semantically equivalent to
 * the one trusted repair for this table (either operand order, optional
 * surrounding whitespace/parens). This is a strict allowlist check, not a
 * general SQL parser — it exists only to decide whether the proposal may
 * be offered to a human for approval. The SQL actually executed on
 * approval is always REPAIR_SQL above, never the AI's raw text.
 */
/**
 * The rules whose finding the trusted repair actually fixes: an allow-all
 * USING clause on a SELECT policy. Deliberately a short explicit list
 * rather than a severity check — "critical" says how bad a finding is, not
 * whether this one fixed statement addresses it.
 */
const REPAIRABLE_RULE_IDS: ReadonlySet<string> = new Set(["RLS_ALLOW_ALL", "VIBE_ANON_ALLOW_ALL"]);

function normaliseTableName(name: string): string {
  return name.replace(/"/g, "").trim().toLowerCase();
}

/**
 * Returns the one finding in a scan that the trusted, predefined repair
 * genuinely fixes, or null when there is none.
 *
 * This exists so the UI never has to guess. REPAIR_SQL rewrites one named
 * policy on one named table; it is not a general remedy, and offering it
 * against any other finding would either do nothing or silently do the
 * wrong thing. A finding being critical is not a reason to offer it.
 *
 * Callers must still be on the authorised demo repository — the open-PR
 * route enforces that independently.
 */
export function findTrustedRepairTarget<
  T extends { ruleId: string; table: string | null; clause: "USING" | "WITH CHECK" | null },
>(findings: readonly T[]): T | null {
  return (
    findings.find(
      (finding) =>
        REPAIRABLE_RULE_IDS.has(finding.ruleId) &&
        finding.clause === "USING" &&
        finding.table !== null &&
        normaliseTableName(finding.table) === REPAIR_TARGET_TABLE,
    ) ?? null
  );
}

export function isTrustedRepairExpression(expression: string): boolean {
  const normalised = normaliseExpression(expression).toLowerCase().replace(/\s+/g, "");

  const left = `auth.uid()=${REPAIR_TARGET_OWNER_COLUMN}`;
  const right = `${REPAIR_TARGET_OWNER_COLUMN}=auth.uid()`;

  return normalised === left || normalised === right;
}
