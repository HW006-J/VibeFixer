import { generateStructuredJson } from "./generate-structured";
import { isGeminiConfigured } from "./gemini-client";
import type { AiSemanticReview } from "../audit/types";

export const MAX_AI_REVIEWS_PER_SCAN = 5;

const RESPONSE_SCHEMA = {
  type: "object",
  properties: {
    assessment: { type: "string", enum: ["likely_safe", "likely_unsafe", "uncertain"] },
    reasoning: { type: "string" },
  },
  required: ["assessment", "reasoning"],
  additionalProperties: false,
} as const;

/** True only when a server-only GEMINI_API_KEY is configured. */
export function isAiSemanticReviewAvailable(): boolean {
  return isGeminiConfigured();
}

export type SemanticReviewInput = {
  clause: "USING" | "WITH CHECK";
  table: string | null;
  operation: string | null;
  role: string | null;
  expression: string;
  evidence: string;
};

function buildPrompt(input: SemanticReviewInput): string {
  return `You are reviewing a single PostgreSQL Row Level Security policy clause from a Supabase application's migration SQL. Assess only whether this clause plausibly scopes access to the requesting user's own data. Base your assessment strictly on the SQL shown — do not assume anything about the schema, other policies, or application code that isn't shown.

Table: ${input.table ?? "unknown"}
Operation: ${input.operation ?? "unknown"}
Role: ${input.role ?? "unknown"}
Clause: ${input.clause}
Expression: ${input.expression}

Full policy statement:
${input.evidence}`;
}

/**
 * Sends one policy clause to a real Gemini model for a semantic opinion.
 * Only ever called for clauses the deterministic rules could not classify.
 * Returns `{ performed: false }` whenever no API key is configured or the
 * call fails for any reason — callers must never treat that as a review
 * having happened.
 */
export async function reviewPolicyClauseSemantically(
  input: SemanticReviewInput,
): Promise<AiSemanticReview | { performed: false }> {
  const outcome = await generateStructuredJson<{
    assessment: AiSemanticReview["assessment"];
    reasoning: string;
  }>({
    prompt: buildPrompt(input),
    schema: RESPONSE_SCHEMA,
    maxOutputTokens: 500,
  });

  if (!outcome.performed) return { performed: false };

  return {
    performed: true,
    assessment: outcome.data.assessment,
    reasoning: outcome.data.reasoning,
    model: outcome.model,
  };
}
