import { afterEach, describe, expect, it, vi } from "vitest";

const detectDeploymentCapabilitiesMock = vi.fn();

vi.mock("@/lib/deployment/capabilities", () => ({
  detectDeploymentCapabilities: (...args: unknown[]) => detectDeploymentCapabilitiesMock(...args),
}));

afterEach(() => {
  vi.clearAllMocks();
  vi.resetModules();
});

describe("GET /api/deployment-capabilities", () => {
  it("returns the real detected capabilities", async () => {
    detectDeploymentCapabilitiesMock.mockResolvedValue({
      staticScan: true,
      liveValidation: true,
      geminiAnalysis: true,
      databaseMutation: false,
      demoReset: false,
      reason: "Policy apply and demo reset require the authenticated local Supabase CLI...",
    });

    const { GET } = await import("./route");
    const response = await GET();
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toMatchObject({
      ok: true,
      staticScan: true,
      liveValidation: true,
      geminiAnalysis: true,
      databaseMutation: false,
      demoReset: false,
    });
    expect(body.reason).toMatch(/authenticated local supabase cli/i);
  });
});
