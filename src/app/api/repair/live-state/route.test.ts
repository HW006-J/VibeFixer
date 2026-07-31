import { afterEach, describe, expect, it, vi } from "vitest";

const determineLiveDemoStateMock = vi.fn();

vi.mock("@/lib/repair/live-state", () => ({
  determineLiveDemoState: (...args: unknown[]) => determineLiveDemoStateMock(...args),
}));

afterEach(() => {
  vi.clearAllMocks();
  vi.unstubAllEnvs();
  vi.resetModules();
});

function postRequest(repositoryUrl: unknown) {
  return new Request("http://localhost/api/repair/live-state", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ repositoryUrl }),
  });
}

describe("POST /api/repair/live-state", () => {
  it("rejects an arbitrary public repository and never calls the live-state inspection", async () => {
    vi.stubEnv("DEMO_GITHUB_REPOSITORY", "HW006-J/rls-red-alert-demo-target");
    const { POST } = await import("./route");

    const response = await POST(postRequest("https://github.com/some-other-org/unrelated-repo"));
    const body = await response.json();

    expect(response.status).toBe(403);
    expect(body).toMatchObject({ ok: false });
    expect(determineLiveDemoStateMock).not.toHaveBeenCalled();
  });

  it("inspects live state only for the exact configured demo repository", async () => {
    vi.stubEnv("DEMO_GITHUB_REPOSITORY", "HW006-J/rls-red-alert-demo-target");
    determineLiveDemoStateMock.mockResolvedValue({ status: "vulnerable" });
    const { POST } = await import("./route");

    const response = await POST(postRequest("https://github.com/HW006-J/rls-red-alert-demo-target"));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toMatchObject({ ok: true, status: "vulnerable" });
    expect(determineLiveDemoStateMock).toHaveBeenCalledTimes(1);
    // The gate only ever passes through the repository check result — no
    // browser-supplied project/table/schema/policy identifier is ever
    // forwarded into the state-inspection call itself.
    expect(determineLiveDemoStateMock).toHaveBeenCalledWith();
  });
});
