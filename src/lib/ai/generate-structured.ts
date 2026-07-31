import { getGeminiClient, getGeminiModel } from "./gemini-client";

const DEFAULT_TIMEOUT_MS = 20_000;
/**
 * Current Gemini flash models think by default and cannot fully disable it
 * (thinkingBudget: 0 returns 400 INVALID_ARGUMENT on this model) — thinking
 * tokens are drawn from the same maxOutputTokens budget as the visible
 * response. Observed live: ~100-500 thinking tokens for a short structured
 * reply. A low budget (e.g. 400-500) reliably cuts the response off with
 * finishReason "MAX_TOKENS" before any JSON is emitted. 2048 leaves solid
 * headroom without being wasteful for these short schemas.
 */
const DEFAULT_MAX_OUTPUT_TOKENS = 2048;

export type StructuredGenerationOutcome<T> =
  | { performed: true; data: T; model: string; durationMs: number }
  | { performed: false };

/**
 * Calls Gemini once with a JSON-schema-constrained response and parses the
 * result. Returns `{ performed: false }} whenever GEMINI_API_KEY is not
 * configured, the request times out or errors, the model's response is
 * blocked/incomplete (any finishReason other than "STOP"), or the response
 * text fails to parse — callers must never treat that as a real review or
 * proposal having happened.
 */
export async function generateStructuredJson<T>(options: {
  prompt: string;
  schema: object;
  maxOutputTokens?: number;
  timeoutMs?: number;
}): Promise<StructuredGenerationOutcome<T>> {
  const client = getGeminiClient();
  if (!client) return { performed: false };

  const model = getGeminiModel();

  const startedAt = Date.now();
  try {
    const response = await client.models.generateContent({
      model,
      contents: options.prompt,
      config: {
        responseMimeType: "application/json",
        responseJsonSchema: options.schema,
        maxOutputTokens: options.maxOutputTokens ?? DEFAULT_MAX_OUTPUT_TOKENS,
        httpOptions: { timeout: options.timeoutMs ?? DEFAULT_TIMEOUT_MS },
      },
    });
    const durationMs = Date.now() - startedAt;

    const finishReason = response.candidates?.[0]?.finishReason;
    if (finishReason && finishReason !== "STOP") {
      // Safety block, recitation, max-tokens cutoff, etc. — never treat a
      // non-normal stop as a completed, trustworthy review.
      return { performed: false };
    }

    const text = response.text;
    if (!text) return { performed: false };

    const data = JSON.parse(text) as T;
    return { performed: true, data, model, durationMs };
  } catch {
    return { performed: false };
  }
}
