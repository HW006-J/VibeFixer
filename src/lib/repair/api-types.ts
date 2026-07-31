import type { LiveDemoState } from "./live-state";

export type RepairRequestBody = {
  repositoryUrl: string;
};

export type RepairErrorResponse = {
  ok: false;
  error: { code: string; message: string };
};

export type RepairProposeSuccessResponse = {
  ok: true;
  repository: string;
  table: string;
  operation: string;
  role: string;
  /** The real, freshly re-queried live USING expression at the moment this ran. */
  currentExpression: string | null;
  /** Real evidence from a fresh live-validate rerun, gathered before asking the model. */
  leakedRowCount: number;
  /** True only when this table's live policy already matches the trusted repair — no model call was needed. */
  alreadyRepaired: boolean;
  /** True only when a real Gemini call actually completed successfully. */
  aiPerformed: boolean;
  provider: string | null;
  model: string | null;
  /** Real wall-clock time of the model call, in milliseconds. */
  durationMs: number | null;
  explanation: string | null;
  proposedExpression: string | null;
  confidence: "high" | "medium" | "low" | null;
  assumptions: string | null;
  /** Whether the backend's strict validator accepted the proposal as the one trusted repair for this table. */
  valid: boolean;
  /** The exact expression that will be applied if a human approves — always this fixed value, never the AI's raw text. */
  trustedExpression: string;
};

export type RepairProposeApiResponse = RepairProposeSuccessResponse | RepairErrorResponse;

export type RepairApplySuccessResponse = {
  ok: true;
  repository: string;
  appliedExpression: string;
};

export type RepairApplyApiResponse = RepairApplySuccessResponse | RepairErrorResponse;

export type RepairResetSuccessResponse = {
  ok: true;
  repository: string;
  restoredExpression: string;
};

export type RepairResetApiResponse = RepairResetSuccessResponse | RepairErrorResponse;

export type LiveStateSuccessResponse = { ok: true } & LiveDemoState;

export type LiveStateApiResponse = LiveStateSuccessResponse | RepairErrorResponse;

export type RepairPreflightResponse = {
  ok: true;
  /** True only when a real round-trip check (CLI resolved, project linked and matching, authenticated, query succeeded) passed. */
  ready: boolean;
  /** Present only when ready is false — a stable, non-secret error category (e.g. CLI_UNAVAILABLE, PROJECT_LINK_MISMATCH). */
  error?: string;
  /** Present only when ready is false — a safe, sanitised explanation. Never raw CLI output. */
  message?: string;
};

export type RepairPreflightApiResponse = RepairPreflightResponse | RepairErrorResponse;
