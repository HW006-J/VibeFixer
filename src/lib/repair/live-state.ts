import { isLiteralTrueExpression } from "../audit/sql-expressions";
import { readDemoSupabaseConfig, runLiveValidation } from "../supabase/live-validate";
import { getCurrentPolicyExpression } from "./db-admin";
import { isTrustedRepairExpression, REPAIR_TARGET_TABLE } from "./trusted-repair";

export type LiveDemoState =
  | {
      status: "vulnerable";
      table: string;
      currentExpression: string;
      totalRowsReturned: number;
      ownRowCount: number;
      leakedRowCount: number;
    }
  | {
      status: "protected";
      table: string;
      currentExpression: string;
      totalRowsReturned: number;
      ownRowCount: number;
      leakedRowCount: number;
    }
  | {
      status: "unexpected";
      reason: string;
      currentExpression: string | null;
      totalRowsReturned: number | null;
      ownRowCount: number | null;
      leakedRowCount: number | null;
    }
  | { status: "unavailable"; reason: string };

/**
 * Derives the demo database's real current state from live evidence —
 * never from anything a browser remembers about a prior apply/reset. Reads
 * the live policy expression and reruns the identical authenticated
 * Trainer A query, then classifies the pair of facts against the two known
 * fixed templates (trusted-repair.ts). Any state where the policy and the
 * query evidence don't agree is reported as "unexpected" rather than
 * guessed at — this function never claims "protected" or "vulnerable" on
 * partial or contradictory evidence.
 */
export async function determineLiveDemoState(): Promise<LiveDemoState> {
  const config = readDemoSupabaseConfig();
  if (!config) {
    return { status: "unavailable", reason: "The demo Supabase environment is not fully configured on the server." };
  }

  const [policyResult, validationResult] = await Promise.all([
    getCurrentPolicyExpression(),
    runLiveValidation(config),
  ]);

  if (!policyResult.ok) {
    return { status: "unavailable", reason: policyResult.message };
  }
  if (!validationResult.ok) {
    return { status: "unavailable", reason: validationResult.message };
  }

  const { expression } = policyResult;
  const { totalRowsReturned, ownRowCount, leakedRowCount } = validationResult;

  if (expression === null) {
    return {
      status: "unexpected",
      reason: "No live policy was found for the demo table — the target schema or policy may be missing.",
      currentExpression: null,
      totalRowsReturned,
      ownRowCount,
      leakedRowCount,
    };
  }

  if (isLiteralTrueExpression(expression)) {
    if (leakedRowCount > 0) {
      return {
        status: "vulnerable",
        table: REPAIR_TARGET_TABLE,
        currentExpression: expression,
        totalRowsReturned,
        ownRowCount,
        leakedRowCount,
      };
    }
    return {
      status: "unexpected",
      reason: "The live policy is the known vulnerable template, but the live query did not return any cross-tenant rows.",
      currentExpression: expression,
      totalRowsReturned,
      ownRowCount,
      leakedRowCount,
    };
  }

  if (isTrustedRepairExpression(expression)) {
    if (leakedRowCount === 0 && ownRowCount > 0) {
      return {
        status: "protected",
        table: REPAIR_TARGET_TABLE,
        currentExpression: expression,
        totalRowsReturned,
        ownRowCount,
        leakedRowCount,
      };
    }
    return {
      status: "unexpected",
      reason:
        leakedRowCount > 0
          ? "The live policy is the trusted repair, but the live query still returned cross-tenant rows."
          : "The live policy is the trusted repair, but no owned rows were returned to confirm it.",
      currentExpression: expression,
      totalRowsReturned,
      ownRowCount,
      leakedRowCount,
    };
  }

  return {
    status: "unexpected",
    reason: "The live policy does not match either the known vulnerable template or the trusted repair.",
    currentExpression: expression,
    totalRowsReturned,
    ownRowCount,
    leakedRowCount,
  };
}
