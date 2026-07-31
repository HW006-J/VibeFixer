import { afterEach, describe, expect, it, vi } from "vitest";
import { isAiSemanticReviewAvailable, reviewPolicyClauseSemantically } from "./semantic-review";

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("isAiSemanticReviewAvailable", () => {
  it("is false when GEMINI_API_KEY is not set", () => {
    vi.stubEnv("GEMINI_API_KEY", "");
    expect(isAiSemanticReviewAvailable()).toBe(false);
  });

  it("is true when GEMINI_API_KEY is set", () => {
    vi.stubEnv("GEMINI_API_KEY", "test-gemini-key");
    expect(isAiSemanticReviewAvailable()).toBe(true);
  });
});

describe("reviewPolicyClauseSemantically", () => {
  it("never claims a review was performed when no API key is configured", async () => {
    vi.stubEnv("GEMINI_API_KEY", "");

    const result = await reviewPolicyClauseSemantically({
      clause: "USING",
      table: "public.t",
      operation: "SELECT",
      role: "authenticated",
      expression: "status = 'active'",
      evidence: "create policy ...",
    });

    expect(result).toEqual({ performed: false });
  });
});
