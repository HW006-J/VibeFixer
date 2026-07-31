// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { RepairFlowPanel } from "./repair-flow-panel";

const PROPOSAL = {
  ok: true,
  repository: "HW006-J/rls-red-alert-demo-target",
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
  explanation: "This is the real explanation text from the model.",
  proposedExpression: "auth.uid() = trainer_id",
  confidence: "high",
  assumptions: "Some stated assumption.",
  valid: true,
  trustedExpression: "auth.uid() = trainer_id",
};

function jsonResponse(body: unknown): Promise<Response> {
  return Promise.resolve({ json: () => Promise.resolve(body) } as unknown as Response);
}

function mockFetchSequence(overrides: { propose?: unknown; preflight?: unknown; apply?: unknown }) {
  vi.stubGlobal(
    "fetch",
    vi.fn((input: RequestInfo | URL) => {
      const url = typeof input === "string" ? input : input.toString();
      if (url.includes("/api/repair/propose")) return jsonResponse(overrides.propose ?? PROPOSAL);
      if (url.includes("/api/repair/preflight")) return jsonResponse(overrides.preflight ?? { ok: true, ready: true });
      if (url.includes("/api/repair/apply")) {
        return jsonResponse(
          overrides.apply ?? { ok: true, repository: "x", appliedExpression: "auth.uid() = trainer_id" },
        );
      }
      return Promise.reject(new Error(`unexpected fetch to ${url}`));
    }),
  );
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("RepairFlowPanel", () => {
  it("does not offer Approve and apply, and shows a specific setup error, when preflight reports the mutation channel is not ready", async () => {
    mockFetchSequence({
      preflight: {
        ok: true,
        ready: false,
        error: "PROJECT_LINK_MISMATCH",
        message: "Refusing to run any mutation for safety.",
      },
    });

    render(<RepairFlowPanel repositoryUrl="https://github.com/HW006-J/rls-red-alert-demo-target" />);
    fireEvent.click(screen.getByRole("button", { name: /get ai repair proposal/i }));

    await screen.findByText(/refusing to run any mutation for safety/i);

    expect(screen.queryByRole("button", { name: /approve and apply this fix/i })).toBeNull();
  });

  it("offers Approve and apply once preflight confirms the mutation channel is ready", async () => {
    mockFetchSequence({});

    render(<RepairFlowPanel repositoryUrl="https://github.com/HW006-J/rls-red-alert-demo-target" />);
    fireEvent.click(screen.getByRole("button", { name: /get ai repair proposal/i }));

    const applyButton = await screen.findByRole("button", { name: /approve and apply this fix/i });
    expect(applyButton).toBeTruthy();
  });

  it("keeps the AI proposal visible and clarifies the proposal succeeded but the apply step failed", async () => {
    mockFetchSequence({
      apply: {
        ok: false,
        error: { code: "PROJECT_LINK_MISMATCH", message: "Refusing to run any mutation for safety." },
      },
    });

    render(<RepairFlowPanel repositoryUrl="https://github.com/HW006-J/rls-red-alert-demo-target" />);
    fireEvent.click(screen.getByRole("button", { name: /get ai repair proposal/i }));

    const applyButton = await screen.findByRole("button", { name: /approve and apply this fix/i });
    fireEvent.click(applyButton);

    await screen.findByText(/proposal above succeeded and was validated, but applying it to the database failed/i);

    expect(screen.getByText(PROPOSAL.explanation)).toBeTruthy();
  });
});
