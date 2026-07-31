import { getGeminiClient, getGeminiModel } from "./gemini-client";

const DEFAULT_TIMEOUT_MS = 15_000;

export type StructuredGenerationOutcome<T> =
  | { performed: true; data: T; model: string }
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

  try {
    const response = await client.models.generateContent({
      model,
      contents: options.prompt,
      config: {
        responseMimeType: "application/json",
        responseJsonSchema: options.schema,
        maxOutputTokens: options.maxOutputTokens,
        httpOptions: { timeout: options.timeoutMs ?? DEFAULT_TIMEOUT_MS },
      },
    });

    const finishReason = response.candidates?.[0]?.finishReason;
    if (finishReason && finishReason !== "STOP") {
      // Safety block, recitation, max-tokens cutoff, etc. — never treat a
      // non-normal stop as a completed, trustworthy review.
      return { performed: false };
    }

    const text = response.text;
    if (!text) return { performed: false };

    const data = JSON.parse(text) as T;
    return { performed: true, data, model };
  } catch {
    return { performed: false };
  }
}
