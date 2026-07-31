import { NextResponse } from "next/server";
import { requireDemoRepository } from "@/lib/github/require-demo-repository";
import { resetVulnerableState } from "@/lib/repair/db-admin";
import { VULNERABLE_EXPRESSION } from "@/lib/repair/trusted-repair";
import type { RepairErrorResponse, RepairResetSuccessResponse } from "@/lib/repair/api-types";

export const runtime = "nodejs";

function jsonError(code: string, message: string, status: number) {
  const body: RepairErrorResponse = { ok: false, error: { code, message } };
  return NextResponse.json(body, { status });
}

/**
 * Restores the original, intentionally vulnerable demo policy so the whole
 * scan → validate → repair flow can be repeated. Always runs the same
 * fixed SQL from trusted-repair.ts — never accepts SQL from the request.
 */
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

  const gate = requireDemoRepository(repositoryUrl);
  if (!gate.ok) {
    return jsonError(gate.code, gate.message, gate.status);
  }

  try {
    const outcome = await resetVulnerableState();
    if (!outcome.ok) {
      return jsonError(outcome.error, outcome.message, 502);
    }

    const responseBody: RepairResetSuccessResponse = {
      ok: true,
      repository: `${gate.repository.owner}/${gate.repository.repo}`,
      restoredExpression: VULNERABLE_EXPRESSION,
    };
    return NextResponse.json(responseBody, { status: 200 });
  } catch {
    return jsonError("UNKNOWN", "An unexpected error occurred while resetting the demo.", 500);
  }
}
