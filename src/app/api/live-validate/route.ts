import { NextResponse } from "next/server";
import { isSameRepository, parseRepositoryUrl } from "@/lib/github/parse-repository-url";
import { readDemoSupabaseConfig, runLiveValidation } from "@/lib/supabase/live-validate";
import type {
  LiveValidationErrorResponse,
  LiveValidationSuccessResponse,
} from "@/lib/scanner/api-types";

export const runtime = "nodejs";

function jsonError(code: string, message: string, status: number) {
  const body: LiveValidationErrorResponse = { ok: false, error: { code, message } };
  return NextResponse.json(body, { status });
}

export async function POST(request: Request) {
  const demoRepository = process.env.DEMO_GITHUB_REPOSITORY;
  if (!demoRepository) {
    return jsonError("SERVER_MISCONFIGURED", "The server is not configured with a demonstration repository.", 500);
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

  const parsed = parseRepositoryUrl(repositoryUrl);
  if (!parsed.ok) {
    return jsonError(parsed.error, "That repository URL is not valid.", 400);
  }

  if (!isSameRepository(parsed.repository, demoRepository)) {
    return jsonError(
      "LIVE_VALIDATION_NOT_AVAILABLE",
      "Live validation requires an authorised connected test environment.",
      403,
    );
  }

  const config = readDemoSupabaseConfig();
  if (!config) {
    return jsonError(
      "SERVER_MISCONFIGURED",
      "The demo Supabase environment is not fully configured on the server.",
      500,
    );
  }

  const startedAt = Date.now();

  try {
    const outcome = await runLiveValidation(config);

    if (!outcome.ok) {
      const status = outcome.error === "TIMEOUT" ? 504 : outcome.error === "NETWORK_ERROR" ? 502 : 502;
      return jsonError(outcome.error, outcome.message, status);
    }

    const responseBody: LiveValidationSuccessResponse = {
      ok: true,
      repository: `${parsed.repository.owner}/${parsed.repository.repo}`,
      table: outcome.table,
      attackerEmail: outcome.attackerEmail,
      attackerUserId: outcome.attackerUserId,
      totalRowsReturned: outcome.totalRowsReturned,
      ownRowCount: outcome.ownRowCount,
      leakedRowCount: outcome.leakedRowCount,
      leakedRows: outcome.leakedRows,
      durationMs: Date.now() - startedAt,
    };

    return NextResponse.json(responseBody, { status: 200 });
  } catch {
    return jsonError("UNKNOWN", "An unexpected error occurred during live validation.", 500);
  }
}
