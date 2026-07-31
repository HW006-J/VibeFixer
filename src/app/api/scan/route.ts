import { NextResponse } from "next/server";
import {
  parseRepositoryUrl,
  type ParseRepositoryUrlError,
} from "@/lib/github/parse-repository-url";
import {
  fetchSupabaseFiles,
  type GithubFetchErrorCode,
} from "@/lib/github/fetch-supabase-files";
import { scanRlsPolicies } from "@/lib/scanner/scan-rls-policies";
import type { ScanErrorResponse, ScanSuccessResponse } from "@/lib/scanner/api-types";

export const runtime = "nodejs";

const PARSE_ERROR_MESSAGES: Record<ParseRepositoryUrlError, string> = {
  EMPTY_INPUT: "Enter a GitHub repository URL.",
  INVALID_URL: "That doesn't look like a valid URL.",
  UNSUPPORTED_HOST: "Only https://github.com repository URLs are supported.",
  UNSUPPORTED_PATH: "Enter a URL in the form https://github.com/<owner>/<repo>.",
  REPOSITORY_NOT_AUTHORISED: "Only the authorised demonstration repository may be scanned.",
};

const PARSE_ERROR_STATUS: Record<ParseRepositoryUrlError, number> = {
  EMPTY_INPUT: 400,
  INVALID_URL: 400,
  UNSUPPORTED_HOST: 400,
  UNSUPPORTED_PATH: 400,
  REPOSITORY_NOT_AUTHORISED: 403,
};

const FETCH_ERROR_STATUS: Record<GithubFetchErrorCode, number> = {
  NOT_FOUND: 404,
  RATE_LIMITED: 429,
  TIMEOUT: 504,
  NETWORK_ERROR: 502,
  MALFORMED_RESPONSE: 502,
  TREE_TRUNCATED: 502,
  UNKNOWN: 502,
};

function jsonError(code: string, message: string, status: number) {
  const body: ScanErrorResponse = { ok: false, error: { code, message } };
  return NextResponse.json(body, { status });
}

export async function POST(request: Request) {
  const allowedRepository = process.env.DEMO_GITHUB_REPOSITORY;
  if (!allowedRepository) {
    return jsonError(
      "SERVER_MISCONFIGURED",
      "The server is not configured with an authorised repository.",
      500,
    );
  }

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

  const parsed = parseRepositoryUrl(repositoryUrl, allowedRepository);
  if (!parsed.ok) {
    return jsonError(
      parsed.error,
      PARSE_ERROR_MESSAGES[parsed.error],
      PARSE_ERROR_STATUS[parsed.error],
    );
  }

  const startedAt = Date.now();

  try {
    const filesResult = await fetchSupabaseFiles(parsed.repository, process.env.GITHUB_TOKEN);

    if (!filesResult.ok) {
      return jsonError(
        filesResult.error,
        filesResult.message,
        FETCH_ERROR_STATUS[filesResult.error],
      );
    }

    const repositoryLabel = `${parsed.repository.owner}/${parsed.repository.repo}`;
    const { findings, policiesInspected } = scanRlsPolicies(repositoryLabel, filesResult.files);

    const responseBody: ScanSuccessResponse = {
      ok: true,
      repository: repositoryLabel,
      filesScanned: filesResult.files.map((file) => file.path),
      policiesInspected,
      findings,
      durationMs: Date.now() - startedAt,
    };

    return NextResponse.json(responseBody, { status: 200 });
  } catch {
    return jsonError("UNKNOWN", "An unexpected error occurred while scanning the repository.", 500);
  }
}
