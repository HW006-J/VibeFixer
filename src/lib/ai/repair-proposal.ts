import { generateStructuredJson } from "./generate-structured";
import {
  REPAIR_TARGET_OPERATION,
  REPAIR_TARGET_OWNER_COLUMN,
  REPAIR_TARGET_ROLE,
  REPAIR_TARGET_TABLE,
  isTrustedRepairExpression,
} from "../repair/trusted-repair";

const RESPONSE_SCHEMA = {
  type: "object",
  properties: {
    explanation: { type: "string" },
    proposedExpression: { type: "string" },
  },
  required: ["explanation", "proposedExpression"],
  additionalProperties: false,
} as const;

export type RepairProposalInput = {
  currentExpression: string;
  leakedRowCount: number;
  sampleLeakedRowSummary: string | null;
};

export type RepairProposalResult =
  | {
      performed: true;
      model: string;
      explanation: string;
      proposedExpression: string;
      /** Whether the backend's strict validator accepted proposedExpression as the one trusted repair for this table. */
      valid: boolean;
    }
  | { performed: false };

function buildPrompt(input: RepairProposalInput): string {
  const evidence = input.sampleLeakedRowSummary
    ? `A real authenticated query just returned ${input.leakedRowCount} row(s) belonging to a different tenant, for example: ${input.sampleLeakedRowSummary}.`
    : `A real authenticated query just returned ${input.leakedRowCount} row(s) belonging to a different tenant.`;

  return `You are a database security engineer reviewing a confirmed Supabase Row Level Security vulnerability, proven live against a real (isolated demo) database.

Table: ${REPAIR_TARGET_TABLE}
Operation: ${REPAIR_TARGET_OPERATION}
Role: ${REPAIR_TARGET_ROLE}
Current (vulnerable) USING expression: ${input.currentExpression}
Owner column on this table: ${REPAIR_TARGET_OWNER_COLUMN} (references auth.users(id))

${evidence}

Propose a corrected USING expression that restricts each row to the trainer who owns it, using Supabase's standard auth.uid() pattern compared against the ${REPAIR_TARGET_OWNER_COLUMN} column. Respond with only the corrected boolean SQL expression itself (no "USING", no semicolon, no surrounding parentheses) and a short (2-3 sentence) explanation of why the current expression is unsafe and why your proposed expression fixes it.`;
}

/**
 * Asks Gemini to propose a corrected USING expression for the one known
 * demo vulnerability, grounded in the real rows a live query just
 * returned. Returns `{ performed: false }` whenever no API key is
 * configured or the call fails/is blocked/is incomplete for any reason —
 * callers must never treat that as a proposal having happened.
 *
 * The proposed expression is never executed as-is: `valid` only reports
 * whether it matches the one trusted repair this table has. The actual
 * SQL applied on approval always comes from `trusted-repair.ts`'s fixed
 * REPAIR_SQL constant, never from this response.
 */
export async function proposeRepair(input: RepairProposalInput): Promise<RepairProposalResult> {
  const outcome = await generateStructuredJson<{ explanation: string; proposedExpression: string }>({
    prompt: buildPrompt(input),
    schema: RESPONSE_SCHEMA,
    maxOutputTokens: 400,
  });

  if (!outcome.performed) return { performed: false };

  return {
    performed: true,
    model: outcome.model,
    explanation: outcome.data.explanation,
    proposedExpression: outcome.data.proposedExpression,
    valid: isTrustedRepairExpression(outcome.data.proposedExpression),
  };
}
