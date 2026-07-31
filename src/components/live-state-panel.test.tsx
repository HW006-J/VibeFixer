// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { LiveStatePanel } from "./live-state-panel";

const REPO_URL = "https://github.com/HW006-J/rls-red-alert-demo-target";

const VULNERABLE = {
  ok: true,
  status: "vulnerable",
  table: "public.clients",
  currentExpression: "true",
  totalRowsReturned: 4,
  ownRowCount: 2,
  leakedRowCount: 2,
};

const PROTECTED = {
  ok: true,
  status: "protected",
  table: "public.clients",
  currentExpression: "auth.uid() = trainer_id",
  totalRowsReturned: 2,
  ownRowCount: 2,
  leakedRowCount: 0,
};

const UNEXPECTED = {
  ok: true,
  status: "unexpected",
  reason: "The live policy does not match either the known vulnerable template or the trusted repair.",
  currentExpression: "role = 'admin'",
  totalRowsReturned: 2,
  ownRowCount: 2,
  leakedRowCount: 0,
};

function jsonResponse(body: unknown): Promise<Response> {
  return Promise.resolve({ json: () => Promise.resolve(body) } as unknown as Response);
}

/** Each call to /api/repair/live-state consumes the next entry in liveStateQueue (the last entry repeats once exhausted). */
function mockFetch(options: { liveStateQueue: unknown[]; reset?: unknown }) {
  let liveStateCallIndex = 0;
  const fetchMock = vi.fn((input: RequestInfo | URL) => {
    const url = typeof input === "string" ? input : input.toString();
    if (url.includes("/api/repair/live-state")) {
      const index = Math.min(liveStateCallIndex, options.liveStateQueue.length - 1);
      liveStateCallIndex += 1;
      return jsonResponse(options.liveStateQueue[index]);
    }
    if (url.includes("/api/repair/reset")) {
      return jsonResponse(options.reset ?? { ok: true, repository: "x", restoredExpression: "true" });
    }
    return Promise.reject(new Error(`unexpected fetch to ${url}`));
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("LiveStatePanel", () => {
  it("shows the protected banner, drift notice, and a reset control on a fresh mount with no prior client state", async () => {
    mockFetch({ liveStateQueue: [PROTECTED] });

    render(<LiveStatePanel repositoryUrl={REPO_URL} refreshToken={1} />);

    await screen.findByText(/live database protected/i);
    expect(screen.getByText(/configuration drift detected/i)).toBeTruthy();
    expect(screen.getByText(/source migration remains vulnerable; live database is currently protected/i)).toBeTruthy();
    expect(screen.getByRole("button", { name: /reset vulnerable demo/i })).toBeTruthy();
  });

  it("shows the vulnerable banner and the live validation flow, with no reset control", async () => {
    mockFetch({ liveStateQueue: [VULNERABLE] });

    render(<LiveStatePanel repositoryUrl={REPO_URL} refreshToken={1} />);

    await screen.findByText(/live database vulnerable/i);
    expect(screen.getByRole("button", { name: /run live validation/i })).toBeTruthy();
    expect(screen.queryByRole("button", { name: /reset vulnerable demo/i })).toBeNull();
  });

  it("shows the safe reason and no mutation controls in the unexpected state", async () => {
    mockFetch({ liveStateQueue: [UNEXPECTED] });

    render(<LiveStatePanel repositoryUrl={REPO_URL} refreshToken={1} />);

    await screen.findByText(/unexpected live state/i);
    expect(screen.getByText(UNEXPECTED.reason)).toBeTruthy();
    expect(screen.queryByRole("button", { name: /reset vulnerable demo/i })).toBeNull();
    expect(screen.queryByRole("button", { name: /run live validation/i })).toBeNull();
  });

  it("shows the reason and no controls in the unavailable state", async () => {
    mockFetch({ liveStateQueue: [{ ok: true, status: "unavailable", reason: "The demo Supabase environment is not fully configured on the server." }] });

    render(<LiveStatePanel repositoryUrl={REPO_URL} refreshToken={1} />);

    await screen.findByText(/live state unavailable/i);
    expect(screen.queryByRole("button", { name: /reset vulnerable demo/i })).toBeNull();
    expect(screen.queryByRole("button", { name: /run live validation/i })).toBeNull();
  });

  it("resetting from the protected state calls only the reset route, never a Gemini proposal call, and re-derives state without a page refresh", async () => {
    const fetchMock = mockFetch({ liveStateQueue: [PROTECTED, VULNERABLE] });

    render(<LiveStatePanel repositoryUrl={REPO_URL} refreshToken={1} />);
    const resetButton = await screen.findByRole("button", { name: /reset vulnerable demo/i });
    fireEvent.click(resetButton);

    await screen.findByText(/live database vulnerable/i);

    const calledUrls = fetchMock.mock.calls.map(([input]) => (typeof input === "string" ? input : (input as URL).toString()));
    expect(calledUrls.some((u) => u.includes("/api/repair/reset"))).toBe(true);
    expect(calledUrls.some((u) => u.includes("/api/repair/propose"))).toBe(false);
  });

  it("does not display a stale protected status once a rescan reports fresh vulnerable evidence", async () => {
    mockFetch({ liveStateQueue: [PROTECTED, VULNERABLE] });

    const { rerender } = render(<LiveStatePanel repositoryUrl={REPO_URL} refreshToken={1} />);
    await screen.findByText(/live database protected/i);

    rerender(<LiveStatePanel repositoryUrl={REPO_URL} refreshToken={2} />);

    await screen.findByText(/live database vulnerable/i);
    expect(screen.queryByText(/live database protected/i)).toBeNull();
  });
});
