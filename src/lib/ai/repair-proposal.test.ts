import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("./generate-structured", () => ({
  generateStructuredJson: vi.fn(),
}));

afterEach(() => {
  vi.restoreAllMocks();
});

describe("proposeRepair", () => {
  it("never claims a proposal was performed when the underlying model call did not succeed", async () => {
    const { generateStructuredJson } = await import("./generate-structured");
    vi.mocked(generateStructuredJson).mockResolvedValue({ performed: false });

    const { proposeRepair } = await import("./repair-proposal");
    const result = await proposeRepair({ currentExpression: "true", leakedRowCount: 2, sampleLeakedRowSummary: null });

    expect(result).toEqual({ performed: false });
  });

  it("marks a correct proposal as valid via the strict backend validator and passes through real provider/model/duration/confidence/assumptions", async () => {
    const { generateStructuredJson } = await import("./generate-structured");
    vi.mocked(generateStructuredJson).mockResolvedValue({
      performed: true,
      model: "gemini-flash-latest",
      durationMs: 1234,
      data: {
        explanation: "The current policy allows any authenticated user to read every row.",
        proposedExpression: "auth.uid() = trainer_id",
        confidence: "high",
        assumptions: "Assumes trainer_id is never null.",
      },
    });

    const { proposeRepair } = await import("./repair-proposal");
    const result = await proposeRepair({ currentExpression: "true", leakedRowCount: 2, sampleLeakedRowSummary: "Victor Brown" });

    expect(result).toMatchObject({
      performed: true,
      provider: "Google Gemini",
      model: "gemini-flash-latest",
      durationMs: 1234,
      valid: true,
      proposedExpression: "auth.uid() = trainer_id",
      confidence: "high",
      assumptions: "Assumes trainer_id is never null.",
    });
  });

  it("marks an incorrect or hallucinated proposal as invalid rather than silently accepting it", async () => {
    const { generateStructuredJson } = await import("./generate-structured");
    vi.mocked(generateStructuredJson).mockResolvedValue({
      performed: true,
      model: "gemini-flash-latest",
      durationMs: 900,
      data: {
        explanation: "...",
        proposedExpression: "owner = current_user",
        confidence: "low",
        assumptions: "Assumed an 'owner' column exists.",
      },
    });

    const { proposeRepair } = await import("./repair-proposal");
    const result = await proposeRepair({ currentExpression: "true", leakedRowCount: 2, sampleLeakedRowSummary: null });

    expect(result).toMatchObject({ performed: true, valid: false });
  });
});
