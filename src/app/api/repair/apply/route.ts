import { NextResponse } from "next/server";
import { requireDemoRepository } from "@/lib/github/require-demo-repository";
import { applyTrustedRepair } from "@/lib/repair/db-admin";
import { TRUSTED_REPAIR_EXPRESSION } from "@/lib/repair/trusted-repair";
import type { RepairApplySuccessResponse, RepairErrorResponse } from "@/lib/repair/api-types";

export const runtime = "nodejs";

function jsonError(code: string, message: string, status: number) {
  const body: RepairErrorResponse = { ok: false, error: { code, message } };
  return NextResponse.json(body, { status });
}

/**
 * Applies the one trusted, predefined repair to the live demo database.
 * This route never accepts or executes SQL from the request — it always
 * runs the same fixed statement from trusted-repair.ts. Reaching this
 * route is itself the human-approval step: the UI only calls it after a
 * person clicks "Apply this fix" on an already-validated proposal.
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
    const outcome = await applyTrustedRepair();
    if (!outcome.ok) {
      return jsonError(outcome.error, outcome.message, 502);
    }

    const responseBody: RepairApplySuccessResponse = {
      ok: true,
      repository: `${gate.repository.owner}/${gate.repository.repo}`,
      appliedExpression: TRUSTED_REPAIR_EXPRESSION,
    };
    return NextResponse.json(responseBody, { status: 200 });
  } catch {
    return jsonError("UNKNOWN", "An unexpected error occurred while applying the repair.", 500);
  }
}
