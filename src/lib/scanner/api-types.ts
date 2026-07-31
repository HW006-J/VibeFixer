import type { AuditCoverage, AuditFinding } from "../audit/types";

export type ScanRequestBody = {
  repositoryUrl: string;
};

export type ScanSuccessResponse = {
  ok: true;
  repository: string;
  /** True only for the single repository configured in DEMO_GITHUB_REPOSITORY. */
  isDemoRepository: boolean;
  findings: AuditFinding[];
  coverage: AuditCoverage;
  durationMs: number;
};

export type ScanErrorResponse = {
  ok: false;
  error: { code: string; message: string };
};

export type ScanApiResponse = ScanSuccessResponse | ScanErrorResponse;

export type LiveValidationRequestBody = {
  repositoryUrl: string;
};

export type LiveValidatedRow = {
  id: string;
  trainerId: string;
  name: string;
  email: string | null;
  privateNotes: string | null;
};

export type LiveValidationSuccessResponse = {
  ok: true;
  repository: string;
  table: string;
  attackerEmail: string;
  attackerUserId: string;
  totalRowsReturned: number;
  ownRowCount: number;
  leakedRowCount: number;
  leakedRows: LiveValidatedRow[];
  durationMs: number;
};

export type LiveValidationErrorResponse = {
  ok: false;
  error: { code: string; message: string };
};

export type LiveValidationApiResponse = LiveValidationSuccessResponse | LiveValidationErrorResponse;
