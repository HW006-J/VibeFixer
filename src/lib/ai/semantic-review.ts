import Anthropic from "@anthropic-ai/sdk";
import type { AiReviewAssessment, AiSemanticReview } from "../audit/types";

const MODEL = "claude-opus-5";
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

let cachedClient: Anthropic | null = null;

function getClient(): Anthropic | null {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return null;
  if (!cachedClient) cachedClient = new Anthropic({ apiKey });
  return cachedClient;
}

/** True only when a server-only ANTHROPIC_API_KEY is configured. */
export function isAiSemanticReviewAvailable(): boolean {
  return Boolean(process.env.ANTHROPIC_API_KEY);
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
 * Sends one policy clause to a real Claude model for a semantic opinion.
 * Only ever called for clauses the deterministic rules could not classify.
 * Returns `{ performed: false }` whenever no API key is configured or the
 * call fails for any reason — callers must never treat that as a review
 * having happened.
 */
export async function reviewPolicyClauseSemantically(
  input: SemanticReviewInput,
): Promise<AiSemanticReview | { performed: false }> {
  const client = getClient();
  if (!client) return { performed: false };

  try {
    const response = await client.messages.create({
      model: MODEL,
      max_tokens: 500,
      output_config: {
        effort: "low",
        format: { type: "json_schema", schema: RESPONSE_SCHEMA },
      },
      messages: [{ role: "user", content: buildPrompt(input) }],
    });

    if (response.stop_reason === "refusal") {
      return { performed: false };
    }

    const textBlock = response.content.find(
      (block): block is Anthropic.TextBlock => block.type === "text",
    );
    if (!textBlock) return { performed: false };

    const parsed = JSON.parse(textBlock.text) as {
      assessment: AiReviewAssessment;
      reasoning: string;
    };

    return {
      performed: true,
      assessment: parsed.assessment,
      reasoning: parsed.reasoning,
      model: MODEL,
    };
  } catch {
    return { performed: false };
  }
}
