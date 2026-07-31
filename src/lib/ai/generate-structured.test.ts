import { afterEach, describe, expect, it, vi } from "vitest";

const generateContentMock = vi.fn();

vi.mock("./gemini-client", () => ({
  getGeminiClient: vi.fn(),
  getGeminiModel: () => "gemini-2.5-flash",
}));

afterEach(() => {
  vi.restoreAllMocks();
});

describe("generateStructuredJson", () => {
  it("returns performed: false without ever calling the model when no client is configured", async () => {
    const { getGeminiClient } = await import("./gemini-client");
    vi.mocked(getGeminiClient).mockReturnValue(null);

    const { generateStructuredJson } = await import("./generate-structured");
    const result = await generateStructuredJson({ prompt: "hi", schema: {} });

    expect(result).toEqual({ performed: false });
    expect(generateContentMock).not.toHaveBeenCalled();
  });

  it("parses a successful STOP response into structured data", async () => {
    const { getGeminiClient } = await import("./gemini-client");
    generateContentMock.mockResolvedValue({
      candidates: [{ finishReason: "STOP" }],
      text: JSON.stringify({ ok: true }),
    });
    vi.mocked(getGeminiClient).mockReturnValue({
      models: { generateContent: generateContentMock },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any);

    const { generateStructuredJson } = await import("./generate-structured");
    const result = await generateStructuredJson<{ ok: boolean }>({ prompt: "hi", schema: {} });

    expect(result).toMatchObject({ performed: true, data: { ok: true }, model: "gemini-2.5-flash" });
    if (result.performed) {
      expect(typeof result.durationMs).toBe("number");
      expect(result.durationMs).toBeGreaterThanOrEqual(0);
    }
  });

  it("treats a non-STOP finish reason (e.g. safety block) as not performed", async () => {
    const { getGeminiClient } = await import("./gemini-client");
    generateContentMock.mockResolvedValue({
      candidates: [{ finishReason: "SAFETY" }],
      text: JSON.stringify({ ok: true }),
    });
    vi.mocked(getGeminiClient).mockReturnValue({
      models: { generateContent: generateContentMock },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any);

    const { generateStructuredJson } = await import("./generate-structured");
    const result = await generateStructuredJson({ prompt: "hi", schema: {} });

    expect(result).toEqual({ performed: false });
  });

  it("treats an empty response text as not performed", async () => {
    const { getGeminiClient } = await import("./gemini-client");
    generateContentMock.mockResolvedValue({ candidates: [{ finishReason: "STOP" }], text: "" });
    vi.mocked(getGeminiClient).mockReturnValue({
      models: { generateContent: generateContentMock },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any);

    const { generateStructuredJson } = await import("./generate-structured");
    const result = await generateStructuredJson({ prompt: "hi", schema: {} });

    expect(result).toEqual({ performed: false });
  });

  it("treats a network/API error as not performed rather than throwing", async () => {
    const { getGeminiClient } = await import("./gemini-client");
    generateContentMock.mockRejectedValue(new Error("network down"));
    vi.mocked(getGeminiClient).mockReturnValue({
      models: { generateContent: generateContentMock },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any);

    const { generateStructuredJson } = await import("./generate-structured");
    const result = await generateStructuredJson({ prompt: "hi", schema: {} });

    expect(result).toEqual({ performed: false });
  });
});
