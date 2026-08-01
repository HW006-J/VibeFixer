// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { SecurityDemoPanel } from "./security-demo-panel";

const REPO_URL = "https://github.com/HW006-J/rls-red-alert-demo-target";

const VULNERABLE_STATE = {
  ok: true,
  status: "vulnerable",
  table: "public.clients",
  currentExpression: "true",
  totalRowsReturned: 4,
  ownRowCount: 2,
  leakedRowCount: 2,
};

const PROTECTED_STATE = {
  ok: true,
  status: "protected",
  table: "public.clients",
  currentExpression: "(auth.uid() = trainer_id)",
  totalRowsReturned: 2,
  ownRowCount: 2,
  leakedRowCount: 0,
};

const VALIDATE_VULNERABLE = {
  ok: true,
  repository: "x",
  table: "public.clients",
  attackerEmail: "attacker@example.com",
  attackerUserId: "id1",
  totalRowsReturned: 4,
  ownRowCount: 2,
  leakedRowCount: 2,
  durationMs: 100,
  leakedRows: [
    { id: "row1", trainerId: "other", name: "Victor Brown", email: "victor@example.com", privateNotes: "Confidential note" },
  ],
};

const VALIDATE_PROTECTED = {
  ok: true,
  repository: "x",
  table: "public.clients",
  attackerEmail: "attacker@example.com",
  attackerUserId: "id1",
  totalRowsReturned: 2,
  ownRowCount: 2,
  leakedRowCount: 0,
  durationMs: 100,
  leakedRows: [],
};

const PROPOSAL = {
  ok: true,
  repository: "x",
  table: "public.clients",
  operation: "SELECT",
  role: "authenticated",
  currentExpression: "true",
  leakedRowCount: 2,
  alreadyRepaired: false,
  aiPerformed: true,
  provider: "Google Gemini",
  model: "gemini-flash-latest",
  durationMs: 1234,
  explanation: "The current policy allows any authenticated user to read every row. This exposes cross-tenant data.",
  proposedExpression: "auth.uid() = trainer_id",
  confidence: "high",
  assumptions: "Assumes trainer_id is never null.",
  valid: true,
  trustedExpression: "auth.uid() = trainer_id",
};

const APPLY_SUCCESS = { ok: true, repository: "x", appliedExpression: "auth.uid() = trainer_id" };
const RESET_SUCCESS = { ok: true, repository: "x", restoredExpression: "true" };

const FULL_CAPABILITIES = {
  ok: true,
  staticScan: true,
  liveValidation: true,
  geminiAnalysis: true,
  databaseMutation: true,
  demoReset: true,
  reason: null,
};

function jsonResponse(body: unknown): Promise<Response> {
  return Promise.resolve({ json: () => Promise.resolve(body) } as unknown as Response);
}

type Queues = {
  liveState?: unknown[];
  liveValidate?: unknown[];
  propose?: unknown[];
  apply?: unknown[];
  reset?: unknown[];
  capabilities?: unknown[];
};

function mockFetch(queues: Queues) {
  const indices: Partial<Record<keyof Queues, number>> = {};
  function next(key: keyof Queues, fallback: unknown) {
    const queue = queues[key] ?? [fallback];
    const i = indices[key] ?? 0;
    indices[key] = i + 1;
    return queue[Math.min(i, queue.length - 1)];
  }
  const fetchMock = vi.fn((input: RequestInfo | URL) => {
    const url = typeof input === "string" ? input : (input as URL).toString();
    if (url.includes("/api/repair/live-state")) return jsonResponse(next("liveState", undefined));
    if (url.includes("/api/live-validate")) return jsonResponse(next("liveValidate", undefined));
    if (url.includes("/api/repair/propose")) return jsonResponse(next("propose", undefined));
    if (url.includes("/api/repair/apply")) return jsonResponse(next("apply", undefined));
    if (url.includes("/api/repair/reset")) return jsonResponse(next("reset", undefined));
    // Defaults to fully-available capabilities (matching localhost) unless a test overrides it.
    if (url.includes("/api/deployment-capabilities")) return jsonResponse(next("capabilities", FULL_CAPABILITIES));
    return Promise.reject(new Error(`unexpected fetch to ${url}`));
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("SecurityDemoPanel", () => {
  it("never displays a protected or repair-verified result while the live state is vulnerable", async () => {
    mockFetch({ liveState: [VULNERABLE_STATE] });
    render(<SecurityDemoPanel repositoryUrl={REPO_URL} refreshToken={1} sourceState="finding_present" />);

    await screen.findByText(/live database vulnerable/i);
    expect(screen.queryByText(/repair verified/i)).toBeNull();
    expect(screen.queryByText(/live database protected/i)).toBeNull();
  });

  it("never displays leaked-row evidence while the live state is protected", async () => {
    mockFetch({ liveState: [PROTECTED_STATE] });
    render(<SecurityDemoPanel repositoryUrl={REPO_URL} refreshToken={1} sourceState="finding_present" />);

    await screen.findByText(/live database protected/i);
    expect(screen.queryByText(/cross-tenant exposure verified/i)).toBeNull();
    expect(screen.queryByText(/victor brown/i)).toBeNull();
  });

  it("shows exactly one primary action in the vulnerable, not-yet-validated state", async () => {
    mockFetch({ liveState: [VULNERABLE_STATE] });
    render(<SecurityDemoPanel repositoryUrl={REPO_URL} refreshToken={1} sourceState="finding_present" />);

    await screen.findByText(/live database vulnerable/i);
    const buttons = screen.getAllByRole("button");
    expect(buttons).toHaveLength(1);
    expect(buttons[0].textContent).toMatch(/run live validation/i);
  });

  it("shows exactly one primary action in the protected state", async () => {
    mockFetch({ liveState: [PROTECTED_STATE] });
    render(<SecurityDemoPanel repositoryUrl={REPO_URL} refreshToken={1} sourceState="finding_present" />);

    await screen.findByText(/live database protected/i);
    const buttons = screen.getAllByRole("button");
    expect(buttons).toHaveLength(1);
    expect(buttons[0].textContent).toMatch(/reset vulnerable demo/i);
  });

  it("keeps technical details collapsed by default", async () => {
    mockFetch({ liveState: [PROTECTED_STATE] });
    render(<SecurityDemoPanel repositoryUrl={REPO_URL} refreshToken={1} sourceState="finding_present" />);

    await screen.findByText(/live database protected/i);
    const details = document.querySelector("details");
    expect(details).not.toBeNull();
    expect(details?.open).toBe(false);
  });

  it("does not offer Reset vulnerable demo when demoReset is false, showing the real reason instead", async () => {
    mockFetch({
      liveState: [PROTECTED_STATE],
      capabilities: [
        {
          ...FULL_CAPABILITIES,
          databaseMutation: false,
          demoReset: false,
          reason: "Policy apply and demo reset require the authenticated local Supabase CLI, which is not available in this serverless deployment.",
        },
      ],
    });
    render(<SecurityDemoPanel repositoryUrl={REPO_URL} refreshToken={1} sourceState="finding_present" />);

    await screen.findByText(/live database protected/i);
    expect(screen.queryByRole("button", { name: /reset vulnerable demo/i })).toBeNull();
    expect(screen.getByText(/not available in this serverless deployment/i)).toBeTruthy();
  });

  it("does not offer Approve and apply repair when databaseMutation is false, showing the real reason instead", async () => {
    mockFetch({
      liveState: [VULNERABLE_STATE],
      liveValidate: [VALIDATE_VULNERABLE],
      propose: [PROPOSAL],
      capabilities: [
        {
          ...FULL_CAPABILITIES,
          databaseMutation: false,
          demoReset: false,
          reason: "Policy apply and demo reset require the authenticated local Supabase CLI, which is not available in this serverless deployment.",
        },
      ],
    });
    render(<SecurityDemoPanel repositoryUrl={REPO_URL} refreshToken={1} sourceState="finding_present" />);

    fireEvent.click(await screen.findByRole("button", { name: /run live validation/i }));
    fireEvent.click(await screen.findByRole("button", { name: /ask gemini to design repair/i }));

    await screen.findByText(/gemini repair proposal/i);
    expect(screen.queryByRole("button", { name: /approve and apply repair/i })).toBeNull();
    expect(screen.getByText(/not available in this serverless deployment/i)).toBeTruthy();
  });

  it("does not offer Ask Gemini to design repair when geminiAnalysis is false", async () => {
    mockFetch({
      liveState: [VULNERABLE_STATE],
      liveValidate: [VALIDATE_VULNERABLE],
      capabilities: [{ ...FULL_CAPABILITIES, geminiAnalysis: false }],
    });
    render(<SecurityDemoPanel repositoryUrl={REPO_URL} refreshToken={1} sourceState="finding_present" />);

    fireEvent.click(await screen.findByRole("button", { name: /run live validation/i }));

    await screen.findByText(/gemini analysis is not configured/i);
    expect(screen.queryByRole("button", { name: /ask gemini to design repair/i })).toBeNull();
  });

  it("drives real returned counts into the visible label rather than a fixed string", async () => {
    const customProtected = { ...PROTECTED_STATE, totalRowsReturned: 7, ownRowCount: 7, leakedRowCount: 0 };
    mockFetch({ liveState: [customProtected] });
    render(<SecurityDemoPanel repositoryUrl={REPO_URL} refreshToken={1} sourceState="finding_present" />);

    await screen.findByText(/7 rows returned, 0 cross-tenant rows exposed/i);
  });

  it("shows configuration drift only when the source is vulnerable and the live database is protected", async () => {
    mockFetch({ liveState: [PROTECTED_STATE] });
    render(<SecurityDemoPanel repositoryUrl={REPO_URL} refreshToken={1} sourceState="finding_present" />);

    await screen.findByText(/configuration drift/i);
  });

  it("does not show configuration drift when the source has no finding, even if the live database is protected", async () => {
    mockFetch({ liveState: [PROTECTED_STATE] });
    render(<SecurityDemoPanel repositoryUrl={REPO_URL} refreshToken={1} sourceState="no_finding" />);

    await screen.findByText(/live database protected/i);
    expect(screen.queryByText(/configuration drift/i)).toBeNull();
  });

  it("labels a genuine 'unavailable' live-state response distinctly, with its real reason", async () => {
    mockFetch({
      liveState: [
        { ok: true, status: "unavailable", reason: "The demo Supabase environment is not fully configured on the server." },
      ],
    });
    render(<SecurityDemoPanel repositoryUrl={REPO_URL} refreshToken={1} sourceState="finding_present" />);

    await screen.findByText(/the demo supabase environment is not fully configured/i);
    expect(screen.getAllByText(/live inspection unavailable/i).length).toBeGreaterThan(0);
  });

  it("labels a request-level failure (e.g. the repository gate rejecting it) distinctly from a genuine 'unavailable' status, showing the real reason", async () => {
    mockFetch({
      liveState: [{ ok: false, error: { code: "LIVE_VALIDATION_NOT_AVAILABLE", message: "This action requires an authorised connected test environment." } }],
    });
    render(<SecurityDemoPanel repositoryUrl={REPO_URL} refreshToken={1} sourceState="finding_present" />);

    await screen.findByText(/live check failed/i);
    expect(screen.getByText(/this action requires an authorised connected test environment/i)).toBeTruthy();
    // The generic "Live inspection unavailable" label must not be shown for this distinct failure mode.
    expect(screen.queryByText(/^live inspection unavailable$/i)).toBeNull();
  });

  it("reconstructs state from the server on a rescan rather than keeping stale content", async () => {
    mockFetch({ liveState: [PROTECTED_STATE, VULNERABLE_STATE] });
    const { rerender } = render(<SecurityDemoPanel repositoryUrl={REPO_URL} refreshToken={1} sourceState="finding_present" />);
    await screen.findByText(/live database protected/i);

    rerender(<SecurityDemoPanel repositoryUrl={REPO_URL} refreshToken={2} sourceState="finding_present" />);

    await screen.findByText(/live database vulnerable/i);
    expect(screen.queryByText(/live database protected/i)).toBeNull();
  });

  it("full flow: validate, propose, apply, then reset fully clears the old Gemini proposal and the old repair-verified result", async () => {
    mockFetch({
      liveState: [VULNERABLE_STATE, PROTECTED_STATE, VULNERABLE_STATE],
      liveValidate: [VALIDATE_VULNERABLE, VALIDATE_PROTECTED],
      propose: [PROPOSAL],
      apply: [APPLY_SUCCESS],
      reset: [RESET_SUCCESS],
    });

    render(<SecurityDemoPanel repositoryUrl={REPO_URL} refreshToken={1} sourceState="finding_present" />);

    fireEvent.click(await screen.findByRole("button", { name: /run live validation/i }));
    fireEvent.click(await screen.findByRole("button", { name: /ask gemini to design repair/i }));
    fireEvent.click(await screen.findByRole("button", { name: /approve and apply repair/i }));

    await screen.findByText(/repair verified/i);
    expect(screen.getByText(/before: 4 total \/ 2 foreign/i)).toBeTruthy();
    expect(screen.getByText(/after: 2 total \/ 0 foreign/i)).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: /reset vulnerable demo/i }));

    await screen.findByRole("button", { name: /run live validation/i });
    // The old Gemini proposal must be gone.
    expect(screen.queryByText(/gemini repair proposal/i)).toBeNull();
    // The old repair-verified/applied text must be gone.
    expect(screen.queryByText(/repair verified/i)).toBeNull();
    expect(screen.queryByText(/before: 4 total/i)).toBeNull();
    expect(screen.queryByText(/after: 2 total/i)).toBeNull();
  });

  it("reports real live evidence to onLiveEvidence as soon as the initial check resolves", async () => {
    mockFetch({ liveState: [VULNERABLE_STATE] });
    const onLiveEvidence = vi.fn();

    render(
      <SecurityDemoPanel repositoryUrl={REPO_URL} refreshToken={1} sourceState="finding_present" onLiveEvidence={onLiveEvidence} />,
    );

    await screen.findByText(/live database vulnerable/i);
    expect(onLiveEvidence).toHaveBeenCalledWith({ totalRowsReturned: 4, ownRowCount: 2, leakedRowCount: 2 });
  });

  it("reports updated live evidence to onLiveEvidence after a real reset", async () => {
    mockFetch({
      liveState: [PROTECTED_STATE, VULNERABLE_STATE],
      reset: [RESET_SUCCESS],
    });
    const onLiveEvidence = vi.fn();

    render(
      <SecurityDemoPanel repositoryUrl={REPO_URL} refreshToken={1} sourceState="finding_present" onLiveEvidence={onLiveEvidence} />,
    );

    const resetButton = await screen.findByRole("button", { name: /reset vulnerable demo/i });
    fireEvent.click(resetButton);

    await screen.findByText(/live database vulnerable/i);
    expect(onLiveEvidence).toHaveBeenLastCalledWith({ totalRowsReturned: 4, ownRowCount: 2, leakedRowCount: 2 });
  });
});
