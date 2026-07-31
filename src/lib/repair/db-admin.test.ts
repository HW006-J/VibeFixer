import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import path from "node:path";

const execFileMock = vi.fn();
const existsSyncMock = vi.fn();
const readFileSyncMock = vi.fn();

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

vi.mock("node:fs", () => ({
  existsSync: (...args: unknown[]) => existsSyncMock(...args),
  readFileSync: (...args: unknown[]) => readFileSyncMock(...args),
}));

const DEMO_PROJECT_REF = "abcdefghijklmnopqrst";
const OTHER_PROJECT_REF = "coachflowprojectref01";
// The real resolveProjectRoot() walks up from process.cwd() looking for a
// supabase/ directory (not config.toml — this project is linked via
// `supabase link` without `supabase init`, so config.toml never exists).
const SUPABASE_DIR = path.join(process.cwd(), "supabase");
const CLI_PATH = "/opt/homebrew/bin/supabase";

/** Simulates a fully healthy local setup: CLI resolvable, project root found, linked ref matches DEMO_SUPABASE_URL. */
function mockHealthySetup() {
  existsSyncMock.mockImplementation((checkedPath: string) => {
    if (checkedPath === SUPABASE_DIR) return true;
    if (checkedPath === CLI_PATH) return true;
    return false;
  });
  readFileSyncMock.mockImplementation((checkedPath: string) => {
    if (checkedPath.toString().endsWith("project-ref")) return `${DEMO_PROJECT_REF}\n`;
    throw new Error("unexpected read");
  });
}

beforeEach(() => {
  vi.stubEnv("DEMO_SUPABASE_URL", `https://${DEMO_PROJECT_REF}.supabase.co`);
  vi.stubEnv("SUPABASE_CLI_PATH", undefined);
});

afterEach(() => {
  vi.clearAllMocks();
  vi.unstubAllEnvs();
  vi.resetModules();
});

describe("applyTrustedRepair / resetVulnerableState", () => {
  it("only ever executes the fixed, code-owned SQL constants — never anything derived from a caller", async () => {
    mockHealthySetup();
    execFileMock.mockReturnValue({ stdout: "{}", stderr: "" });
    const { applyTrustedRepair, resetVulnerableState } = await import("./db-admin");
    const { REPAIR_SQL, RESET_SQL } = await import("./trusted-repair");

    const applyResult = await applyTrustedRepair();
    expect(applyResult).toEqual({ ok: true });
    expect(execFileMock).toHaveBeenCalledWith(
      CLI_PATH,
      ["db", "query", "--linked", REPAIR_SQL],
      expect.objectContaining({ shell: false, cwd: process.cwd() }),
    );

    execFileMock.mockClear();

    const resetResult = await resetVulnerableState();
    expect(resetResult).toEqual({ ok: true });
    expect(execFileMock).toHaveBeenCalledWith(
      CLI_PATH,
      ["db", "query", "--linked", RESET_SQL],
      expect.objectContaining({ shell: false, cwd: process.cwd() }),
    );
  });

  it("resolves the CLI to an explicit SUPABASE_CLI_PATH override rather than the bare command name", async () => {
    vi.stubEnv("SUPABASE_CLI_PATH", "/custom/path/supabase");
    existsSyncMock.mockImplementation((checkedPath: string) => {
      if (checkedPath === SUPABASE_DIR) return true;
      if (checkedPath === "/custom/path/supabase") return true;
      return false;
    });
    readFileSyncMock.mockImplementation((checkedPath: string) => {
      if (checkedPath.toString().endsWith("project-ref")) return DEMO_PROJECT_REF;
      throw new Error("unexpected read");
    });
    execFileMock.mockReturnValue({ stdout: "{}", stderr: "" });

    const { applyTrustedRepair } = await import("./db-admin");
    const result = await applyTrustedRepair();

    expect(result).toEqual({ ok: true });
    expect(execFileMock).toHaveBeenCalledWith("/custom/path/supabase", expect.any(Array), expect.any(Object));
  });

  it("reports CLI_UNAVAILABLE when the CLI is not at any known location and not resolvable via PATH", async () => {
    existsSyncMock.mockImplementation((checkedPath: string) => checkedPath === SUPABASE_DIR);
    readFileSyncMock.mockImplementation((checkedPath: string) => {
      if (checkedPath.toString().endsWith("project-ref")) return DEMO_PROJECT_REF;
      throw new Error("unexpected read");
    });
    const enoent = Object.assign(new Error("not found"), { code: "ENOENT" });
    execFileMock.mockReturnValue(enoent);

    const { applyTrustedRepair } = await import("./db-admin");
    const result = await applyTrustedRepair();

    expect(result).toMatchObject({ ok: false, error: "CLI_UNAVAILABLE" });
    // Falls back to the bare command name once no known location exists.
    expect(execFileMock).toHaveBeenCalledWith("supabase", expect.any(Array), expect.any(Object));
  });

  it("reports PROJECT_ROOT_NOT_FOUND and never invokes the CLI when no supabase/ directory can be located", async () => {
    existsSyncMock.mockReturnValue(false);

    const { applyTrustedRepair } = await import("./db-admin");
    const result = await applyTrustedRepair();

    expect(result).toMatchObject({ ok: false, error: "PROJECT_ROOT_NOT_FOUND" });
    expect(execFileMock).not.toHaveBeenCalled();
  });

  it("reports PROJECT_NOT_LINKED and never invokes the CLI when no project-ref file exists", async () => {
    existsSyncMock.mockImplementation((checkedPath: string) => checkedPath === SUPABASE_DIR);
    readFileSyncMock.mockImplementation(() => {
      throw Object.assign(new Error("ENOENT"), { code: "ENOENT" });
    });

    const { applyTrustedRepair } = await import("./db-admin");
    const result = await applyTrustedRepair();

    expect(result).toMatchObject({ ok: false, error: "PROJECT_NOT_LINKED" });
    expect(execFileMock).not.toHaveBeenCalled();
  });

  it("reports PROJECT_LINK_MISMATCH and never invokes the CLI when the linked project differs from the configured demo project", async () => {
    existsSyncMock.mockImplementation((checkedPath: string) => checkedPath === SUPABASE_DIR || checkedPath === CLI_PATH);
    readFileSyncMock.mockImplementation((checkedPath: string) => {
      if (checkedPath.toString().endsWith("project-ref")) return OTHER_PROJECT_REF;
      throw new Error("unexpected read");
    });

    const { applyTrustedRepair } = await import("./db-admin");
    const result = await applyTrustedRepair();

    expect(result).toMatchObject({ ok: false, error: "PROJECT_LINK_MISMATCH" });
    expect(execFileMock).not.toHaveBeenCalled();
  });

  it("reports CLI_UNAUTHENTICATED when the CLI's own error indicates no active session, without leaking the raw error", async () => {
    mockHealthySetup();
    execFileMock.mockReturnValue(
      Object.assign(new Error("failed"), {
        stderr: "Access token not provided. Supply an access token by running supabase login.",
      }),
    );

    const { applyTrustedRepair } = await import("./db-admin");
    const result = await applyTrustedRepair();

    expect(result).toMatchObject({ ok: false, error: "CLI_UNAUTHENTICATED" });
    if (!result.ok) {
      expect(result.message).not.toContain("Access token");
    }
  });

  it("reports CLI_TIMEOUT when the process is killed by the timeout", async () => {
    mockHealthySetup();
    const timeoutError = Object.assign(new Error("timed out"), { killed: true, signal: "SIGTERM" });
    execFileMock.mockReturnValue(timeoutError);

    const { resetVulnerableState } = await import("./db-admin");
    const result = await resetVulnerableState();

    expect(result).toMatchObject({ ok: false, error: "CLI_TIMEOUT" });
  });

  it("reports a sanitised CLI_FAILED for any other execution failure without echoing raw stderr", async () => {
    mockHealthySetup();
    execFileMock.mockReturnValue(new Error('ERROR: syntax error at or near "DR0P" — password=hunter2secretvalue'));

    const { applyTrustedRepair } = await import("./db-admin");
    const result = await applyTrustedRepair();

    expect(result).toMatchObject({ ok: false, error: "CLI_FAILED" });
    if (!result.ok) {
      expect(result.message).not.toContain("hunter2");
      expect(result.message).not.toContain("DR0P");
    }
  });
});

describe("checkMutationReadiness", () => {
  it("reports ready when the CLI resolves, the project matches, and a live round trip succeeds", async () => {
    mockHealthySetup();
    execFileMock.mockReturnValue({ stdout: "{}", stderr: "" });

    const { checkMutationReadiness } = await import("./db-admin");
    const result = await checkMutationReadiness();

    expect(result).toEqual({ ok: true });
    expect(execFileMock).toHaveBeenCalledWith(CLI_PATH, ["db", "query", "--linked", "select 1;"], expect.any(Object));
  });

  it("reports not ready with the same error category the real mutation would hit, without running a mutation", async () => {
    existsSyncMock.mockImplementation((checkedPath: string) => checkedPath === SUPABASE_DIR || checkedPath === CLI_PATH);
    readFileSyncMock.mockImplementation((checkedPath: string) => {
      if (checkedPath.toString().endsWith("project-ref")) return OTHER_PROJECT_REF;
      throw new Error("unexpected read");
    });

    const { checkMutationReadiness } = await import("./db-admin");
    const result = await checkMutationReadiness();

    expect(result).toMatchObject({ ok: false, error: "PROJECT_LINK_MISMATCH" });
    expect(execFileMock).not.toHaveBeenCalled();
  });
});

describe("getCurrentPolicyExpression", () => {
  it("parses the live qual value out of the CLI's JSON output", async () => {
    mockHealthySetup();
    execFileMock.mockReturnValue({ stdout: JSON.stringify({ rows: [{ qual: "true" }] }), stderr: "" });
    const { getCurrentPolicyExpression } = await import("./db-admin");

    const result = await getCurrentPolicyExpression();
    expect(result).toEqual({ ok: true, expression: "true" });
  });

  it("returns a null expression when no matching policy row is found", async () => {
    mockHealthySetup();
    execFileMock.mockReturnValue({ stdout: JSON.stringify({ rows: [] }), stderr: "" });
    const { getCurrentPolicyExpression } = await import("./db-admin");

    const result = await getCurrentPolicyExpression();
    expect(result).toEqual({ ok: true, expression: null });
  });

  it("reports MALFORMED_RESPONSE when the CLI output is not valid JSON", async () => {
    mockHealthySetup();
    execFileMock.mockReturnValue({ stdout: "not json", stderr: "" });
    const { getCurrentPolicyExpression } = await import("./db-admin");

    const result = await getCurrentPolicyExpression();
    expect(result).toMatchObject({ ok: false, error: "MALFORMED_RESPONSE" });
  });
});
