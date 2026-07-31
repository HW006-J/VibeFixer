import { afterEach, describe, expect, it, vi } from "vitest";

const execFileMock = vi.fn();

vi.mock("node:child_process", () => ({
  execFile: (...args: unknown[]) => {
    const callback = args[args.length - 1] as (err: unknown, result?: { stdout: string; stderr: string }) => void;
    const result = execFileMock(...args.slice(0, -1));
    if (result instanceof Error) {
      callback(result);
    } else {
      callback(null, result);
    }
  },
}));

afterEach(() => {
  vi.clearAllMocks();
});

describe("applyTrustedRepair / resetVulnerableState", () => {
  it("only ever executes the fixed, code-owned SQL constants — never anything derived from a caller", async () => {
    execFileMock.mockReturnValue({ stdout: "{}", stderr: "" });
    const { applyTrustedRepair, resetVulnerableState } = await import("./db-admin");
    const { REPAIR_SQL, RESET_SQL } = await import("./trusted-repair");

    const applyResult = await applyTrustedRepair();
    expect(applyResult).toEqual({ ok: true });
    expect(execFileMock).toHaveBeenCalledWith("supabase", ["db", "query", "--linked", REPAIR_SQL], expect.any(Object));

    execFileMock.mockClear();

    const resetResult = await resetVulnerableState();
    expect(resetResult).toEqual({ ok: true });
    expect(execFileMock).toHaveBeenCalledWith("supabase", ["db", "query", "--linked", RESET_SQL], expect.any(Object));
  });

  it("reports CLI_UNAVAILABLE when the supabase binary is not found", async () => {
    const enoent = Object.assign(new Error("not found"), { code: "ENOENT" });
    execFileMock.mockReturnValue(enoent);
    const { applyTrustedRepair } = await import("./db-admin");

    const result = await applyTrustedRepair();
    expect(result).toMatchObject({ ok: false, error: "CLI_UNAVAILABLE" });
  });

  it("reports CLI_TIMEOUT when the process is killed by the timeout", async () => {
    const timeoutError = Object.assign(new Error("timed out"), { killed: true, signal: "SIGTERM" });
    execFileMock.mockReturnValue(timeoutError);
    const { resetVulnerableState } = await import("./db-admin");

    const result = await resetVulnerableState();
    expect(result).toMatchObject({ ok: false, error: "CLI_TIMEOUT" });
  });

  it("reports CLI_FAILED for any other execution failure", async () => {
    execFileMock.mockReturnValue(new Error("some sql error"));
    const { applyTrustedRepair } = await import("./db-admin");

    const result = await applyTrustedRepair();
    expect(result).toMatchObject({ ok: false, error: "CLI_FAILED" });
  });
});

describe("getCurrentPolicyExpression", () => {
  it("parses the live qual value out of the CLI's JSON output", async () => {
    execFileMock.mockReturnValue({ stdout: JSON.stringify({ rows: [{ qual: "true" }] }), stderr: "" });
    const { getCurrentPolicyExpression } = await import("./db-admin");

    const result = await getCurrentPolicyExpression();
    expect(result).toEqual({ ok: true, expression: "true" });
  });

  it("returns a null expression when no matching policy row is found", async () => {
    execFileMock.mockReturnValue({ stdout: JSON.stringify({ rows: [] }), stderr: "" });
    const { getCurrentPolicyExpression } = await import("./db-admin");

    const result = await getCurrentPolicyExpression();
    expect(result).toEqual({ ok: true, expression: null });
  });

  it("reports MALFORMED_RESPONSE when the CLI output is not valid JSON", async () => {
    execFileMock.mockReturnValue({ stdout: "not json", stderr: "" });
    const { getCurrentPolicyExpression } = await import("./db-admin");

    const result = await getCurrentPolicyExpression();
    expect(result).toMatchObject({ ok: false, error: "MALFORMED_RESPONSE" });
  });
});
