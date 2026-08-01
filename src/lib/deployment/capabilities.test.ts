import { afterEach, describe, expect, it, vi } from "vitest";

const readDemoSupabaseConfigMock = vi.fn();
const isGeminiConfiguredMock = vi.fn();
const checkMutationReadinessMock = vi.fn();

vi.mock("../supabase/live-validate", () => ({
  readDemoSupabaseConfig: (...args: unknown[]) => readDemoSupabaseConfigMock(...args),
}));

vi.mock("../ai/gemini-client", () => ({
  isGeminiConfigured: (...args: unknown[]) => isGeminiConfiguredMock(...args),
}));

vi.mock("../repair/db-admin", () => ({
  checkMutationReadiness: (...args: unknown[]) => checkMutationReadinessMock(...args),
}));

afterEach(() => {
  vi.clearAllMocks();
  vi.unstubAllEnvs();
  vi.resetModules();
});

describe("detectDeploymentCapabilities", () => {
  it("reports databaseMutation and demoReset as false on Vercel, without ever probing the CLI", async () => {
    vi.stubEnv("VERCEL", "1");
    readDemoSupabaseConfigMock.mockReturnValue({ url: "x", anonKey: "y", attackerEmail: "a", attackerPassword: "b" });
    isGeminiConfiguredMock.mockReturnValue(true);

    const { detectDeploymentCapabilities } = await import("./capabilities");
    const result = await detectDeploymentCapabilities();

    expect(result.staticScan).toBe(true);
    expect(result.liveValidation).toBe(true);
    expect(result.geminiAnalysis).toBe(true);
    expect(result.databaseMutation).toBe(false);
    expect(result.demoReset).toBe(false);
    expect(result.reason).toMatch(/serverless deployment/i);
    expect(checkMutationReadinessMock).not.toHaveBeenCalled();
  });

  it("reports liveValidation/geminiAnalysis as false on Vercel when their env vars are missing", async () => {
    vi.stubEnv("VERCEL", "1");
    readDemoSupabaseConfigMock.mockReturnValue(null);
    isGeminiConfiguredMock.mockReturnValue(false);

    const { detectDeploymentCapabilities } = await import("./capabilities");
    const result = await detectDeploymentCapabilities();

    expect(result.liveValidation).toBe(false);
    expect(result.geminiAnalysis).toBe(false);
  });

  it("reports databaseMutation and demoReset as true off Vercel when the real CLI probe succeeds", async () => {
    readDemoSupabaseConfigMock.mockReturnValue({ url: "x", anonKey: "y", attackerEmail: "a", attackerPassword: "b" });
    isGeminiConfiguredMock.mockReturnValue(true);
    checkMutationReadinessMock.mockResolvedValue({ ok: true });

    const { detectDeploymentCapabilities } = await import("./capabilities");
    const result = await detectDeploymentCapabilities();

    expect(result.databaseMutation).toBe(true);
    expect(result.demoReset).toBe(true);
    expect(result.reason).toBeNull();
  });

  it("reports databaseMutation and demoReset as false off Vercel when the real CLI probe fails, with the real reason", async () => {
    readDemoSupabaseConfigMock.mockReturnValue({ url: "x", anonKey: "y", attackerEmail: "a", attackerPassword: "b" });
    isGeminiConfiguredMock.mockReturnValue(true);
    checkMutationReadinessMock.mockResolvedValue({ ok: false, error: "CLI_UNAVAILABLE", message: "The Supabase CLI could not be found on this server." });

    const { detectDeploymentCapabilities } = await import("./capabilities");
    const result = await detectDeploymentCapabilities();

    expect(result.databaseMutation).toBe(false);
    expect(result.demoReset).toBe(false);
    expect(result.reason).toBe("The Supabase CLI could not be found on this server.");
  });
});
