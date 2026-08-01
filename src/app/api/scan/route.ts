import { NextResponse } from "next/server";
import {
  isSameRepository,
  parseRepositoryUrl,
  type ParseRepositoryUrlError,
} from "@/lib/github/parse-repository-url";
import { fetchScanFiles, type GithubFetchErrorCode } from "@/lib/github/fetch-scan-files";
import { runUnifiedSecurityScan } from "@/lib/security/run-scan";
import type { ScanErrorResponse, ScanSuccessResponse } from "@/lib/scanner/api-types";

export const runtime = "nodejs";

const PARSE_ERROR_MESSAGES: Record<ParseRepositoryUrlError, string> = {
  EMPTY_INPUT: "Enter a GitHub repository URL.",
  INVALID_URL: "That doesn't look like a valid URL.",
  UNSUPPORTED_PROTOCOL: "Only https:// URLs are supported.",
  UNSUPPORTED_HOST: "Only https://github.com repository URLs are supported.",
  CREDENTIALS_NOT_ALLOWED: "The URL must not contain a username or password.",
  UNSUPPORTED_PATH: "Enter a URL in the form https://github.com/<owner>/<repo>, with no extra path segments.",
  INVALID_OWNER_OR_REPO: "The repository owner or name in that URL is not valid.",
};

const PARSE_ERROR_STATUS: Record<ParseRepositoryUrlError, number> = {
  EMPTY_INPUT: 400,
  INVALID_URL: 400,
  UNSUPPORTED_PROTOCOL: 400,
  UNSUPPORTED_HOST: 400,
  CREDENTIALS_NOT_ALLOWED: 400,
  UNSUPPORTED_PATH: 400,
  INVALID_OWNER_OR_REPO: 400,
};

const FETCH_ERROR_STATUS: Record<GithubFetchErrorCode, number> = {
  NOT_FOUND: 404,
  RATE_LIMITED: 429,
  TIMEOUT: 504,
  NETWORK_ERROR: 502,
  MALFORMED_RESPONSE: 502,
  TREE_TRUNCATED: 502,
  TOO_MANY_FILES: 413,
  FILE_TOO_LARGE: 413,
  TOTAL_SIZE_EXCEEDED: 413,
  UNKNOWN: 502,
};

function jsonError(code: string, message: string, status: number) {
  const body: ScanErrorResponse = { ok: false, error: { code, message } };
  return NextResponse.json(body, { status });
}

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return jsonError("INVALID_REQUEST", "Request body must be valid JSON.", 400);
  }

  const repositoryUrl =
    typeof body === "object" && body !== null && "repositoryUrl" in body
      ? (body as { repositoryUrl: unknown }).repositoryUrl
      : undefined;

  if (typeof repositoryUrl !== "string") {
    return jsonError("INVALID_REQUEST", "\"repositoryUrl\" must be a string.", 400);
  }

  const parsed = parseRepositoryUrl(repositoryUrl);
  if (!parsed.ok) {
    return jsonError(
      parsed.error,
      PARSE_ERROR_MESSAGES[parsed.error],
      PARSE_ERROR_STATUS[parsed.error],
    );
  }

  try {
    const filesResult = await fetchScanFiles(parsed.repository, process.env.GITHUB_TOKEN);

    if (!filesResult.ok) {
      return jsonError(
        filesResult.error,
        filesResult.message,
        FETCH_ERROR_STATUS[filesResult.error],
      );
    }

    const repositoryLabel = `${parsed.repository.owner}/${parsed.repository.repo}`;
    const demoRepository = process.env.DEMO_GITHUB_REPOSITORY;
    const isDemoRepository = Boolean(demoRepository) && isSameRepository(parsed.repository, demoRepository!);

    const scan = await runUnifiedSecurityScan(repositoryLabel, isDemoRepository, filesResult.files);

    const responseBody: ScanSuccessResponse = {
      ok: true,
      repository: scan.repository,
      isDemoRepository: scan.isDemoRepository,
      findings: scan.findings,
      unifiedFindings: scan.unifiedFindings,
      securityReport: scan.securityReport,
      coverage: scan.coverage,
      durationMs: scan.durationMs,
    };

    return NextResponse.json(responseBody, { status: 200 });
  } catch {
    return jsonError("UNKNOWN", "An unexpected error occurred while scanning the repository.", 500);
  }
}
