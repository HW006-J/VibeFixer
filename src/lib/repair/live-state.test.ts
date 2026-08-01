import { afterEach, describe, expect, it, vi } from "vitest";

const readDemoSupabaseConfigMock = vi.fn();
const runLiveValidationMock = vi.fn();
const getCurrentPolicyExpressionMock = vi.fn();

vi.mock("../supabase/live-validate", () => ({
  readDemoSupabaseConfig: (...args: unknown[]) => readDemoSupabaseConfigMock(...args),
  runLiveValidation: (...args: unknown[]) => runLiveValidationMock(...args),
}));

vi.mock("./db-admin", () => ({
  getCurrentPolicyExpression: (...args: unknown[]) => getCurrentPolicyExpressionMock(...args),
}));

const DEMO_CONFIG = {
  url: "https://demo.supabase.co",
  anonKey: "anon-key",
  attackerEmail: "attacker@example.com",
  attackerPassword: "password",
};

function mockValidation(overrides: Partial<{ totalRowsReturned: number; ownRowCount: number; leakedRowCount: number }>) {
  runLiveValidationMock.mockResolvedValue({
    ok: true,
    table: "public.clients",
    attackerEmail: DEMO_CONFIG.attackerEmail,
    attackerUserId: "attacker-id",
    totalRowsReturned: 0,
    ownRowCount: 0,
    leakedRowCount: 0,
    leakedRows: [],
    ...overrides,
  });
}

afterEach(() => {
  vi.clearAllMocks();
  vi.resetModules();
});

describe("determineLiveDemoState", () => {
  it("reports unavailable when the demo Supabase config is missing", async () => {
    readDemoSupabaseConfigMock.mockReturnValue(null);

    const { determineLiveDemoState } = await import("./live-state");
    const result = await determineLiveDemoState();

    expect(result).toMatchObject({ status: "unavailable" });
    expect(getCurrentPolicyExpressionMock).not.toHaveBeenCalled();
    expect(runLiveValidationMock).not.toHaveBeenCalled();
  });

  it("reports unavailable when the live policy read fails", async () => {
    readDemoSupabaseConfigMock.mockReturnValue(DEMO_CONFIG);
    getCurrentPolicyExpressionMock.mockResolvedValue({ ok: false, error: "CLI_UNAVAILABLE", message: "CLI not found." });
    mockValidation({ totalRowsReturned: 4, ownRowCount: 2, leakedRowCount: 2 });

    const { determineLiveDemoState } = await import("./live-state");
    const result = await determineLiveDemoState();

    expect(result).toMatchObject({ status: "unavailable", reason: "CLI not found." });
  });

  it("reports unavailable when the live query fails", async () => {
    readDemoSupabaseConfigMock.mockReturnValue(DEMO_CONFIG);
    getCurrentPolicyExpressionMock.mockResolvedValue({ ok: true, expression: "true" });
    runLiveValidationMock.mockResolvedValue({ ok: false, error: "SIGN_IN_FAILED", message: "Could not sign in." });

    const { determineLiveDemoState } = await import("./live-state");
    const result = await determineLiveDemoState();

    expect(result).toMatchObject({ status: "unavailable", reason: "Could not sign in." });
  });

  it("never reports protected when the query itself fails with 401, even if the deployed policy is already the trusted repair", async () => {
    // This is the specific safety property behind the "live query ... failed
    // with status 401" bug: an authentication/authorization failure on the
    // verification query must never be reported as a successful "protected"
    // result just because the policy text alone looks safe.
    readDemoSupabaseConfigMock.mockReturnValue(DEMO_CONFIG);
    getCurrentPolicyExpressionMock.mockResolvedValue({ ok: true, expression: "auth.uid() = trainer_id" });
    runLiveValidationMock.mockResolvedValue({
      ok: false,
      error: "QUERY_FAILED",
      message: "The live query against public.clients failed with status 401.",
    });

    const { determineLiveDemoState } = await import("./live-state");
    const result = await determineLiveDemoState();

    expect(result).toMatchObject({
      status: "unavailable",
      reason: "The live query against public.clients failed with status 401.",
    });
    expect(result.status).not.toBe("protected");
  });

  it("reports unexpected when no live policy is found for the table", async () => {
    readDemoSupabaseConfigMock.mockReturnValue(DEMO_CONFIG);
    getCurrentPolicyExpressionMock.mockResolvedValue({ ok: true, expression: null });
    mockValidation({ totalRowsReturned: 0, ownRowCount: 0, leakedRowCount: 0 });

    const { determineLiveDemoState } = await import("./live-state");
    const result = await determineLiveDemoState();

    expect(result).toMatchObject({ status: "unexpected", currentExpression: null });
  });

  it("reports vulnerable when the policy is the allow-all template and at least one foreign row is returned", async () => {
    readDemoSupabaseConfigMock.mockReturnValue(DEMO_CONFIG);
    getCurrentPolicyExpressionMock.mockResolvedValue({ ok: true, expression: "true" });
    mockValidation({ totalRowsReturned: 4, ownRowCount: 2, leakedRowCount: 2 });

    const { determineLiveDemoState } = await import("./live-state");
    const result = await determineLiveDemoState();

    expect(result).toMatchObject({
      status: "vulnerable",
      currentExpression: "true",
      totalRowsReturned: 4,
      ownRowCount: 2,
      leakedRowCount: 2,
    });
  });

  it("reports unexpected (not vulnerable) when the allow-all policy is deployed but no foreign rows come back", async () => {
    readDemoSupabaseConfigMock.mockReturnValue(DEMO_CONFIG);
    getCurrentPolicyExpressionMock.mockResolvedValue({ ok: true, expression: "true" });
    mockValidation({ totalRowsReturned: 2, ownRowCount: 2, leakedRowCount: 0 });

    const { determineLiveDemoState } = await import("./live-state");
    const result = await determineLiveDemoState();

    expect(result).toMatchObject({ status: "unexpected" });
  });

  it("reports protected when the policy is the trusted repair, owned rows come back, and zero foreign rows come back", async () => {
    readDemoSupabaseConfigMock.mockReturnValue(DEMO_CONFIG);
    getCurrentPolicyExpressionMock.mockResolvedValue({ ok: true, expression: "auth.uid() = trainer_id" });
    mockValidation({ totalRowsReturned: 2, ownRowCount: 2, leakedRowCount: 0 });

    const { determineLiveDemoState } = await import("./live-state");
    const result = await determineLiveDemoState();

    expect(result).toMatchObject({
      status: "protected",
      currentExpression: "auth.uid() = trainer_id",
      totalRowsReturned: 2,
      ownRowCount: 2,
      leakedRowCount: 0,
    });
  });

  it("reports unexpected (not protected) when the trusted policy is deployed but a foreign row still comes back", async () => {
    readDemoSupabaseConfigMock.mockReturnValue(DEMO_CONFIG);
    getCurrentPolicyExpressionMock.mockResolvedValue({ ok: true, expression: "auth.uid() = trainer_id" });
    mockValidation({ totalRowsReturned: 3, ownRowCount: 2, leakedRowCount: 1 });

    const { determineLiveDemoState } = await import("./live-state");
    const result = await determineLiveDemoState();

    expect(result).toMatchObject({ status: "unexpected" });
  });

  it("reports unexpected (not protected) when the trusted policy is deployed but no owned rows come back", async () => {
    readDemoSupabaseConfigMock.mockReturnValue(DEMO_CONFIG);
    getCurrentPolicyExpressionMock.mockResolvedValue({ ok: true, expression: "auth.uid() = trainer_id" });
    mockValidation({ totalRowsReturned: 0, ownRowCount: 0, leakedRowCount: 0 });

    const { determineLiveDemoState } = await import("./live-state");
    const result = await determineLiveDemoState();

    expect(result).toMatchObject({ status: "unexpected" });
  });

  it("reports unexpected when the live policy matches neither known template", async () => {
    readDemoSupabaseConfigMock.mockReturnValue(DEMO_CONFIG);
    getCurrentPolicyExpressionMock.mockResolvedValue({ ok: true, expression: "role = 'admin'" });
    mockValidation({ totalRowsReturned: 2, ownRowCount: 2, leakedRowCount: 0 });

    const { determineLiveDemoState } = await import("./live-state");
    const result = await determineLiveDemoState();

    expect(result).toMatchObject({ status: "unexpected", currentExpression: "role = 'admin'" });
  });
});
