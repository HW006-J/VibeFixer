import type { RlsFinding } from "./types";

export type ScanRequestBody = {
  repositoryUrl: string;
};

export type ScanSuccessResponse = {
  ok: true;
  repository: string;
  filesScanned: string[];
  policiesInspected: number;
  findings: RlsFinding[];
  durationMs: number;
};

export type ScanErrorResponse = {
  ok: false;
  error: { code: string; message: string };
};

export type ScanApiResponse = ScanSuccessResponse | ScanErrorResponse;
