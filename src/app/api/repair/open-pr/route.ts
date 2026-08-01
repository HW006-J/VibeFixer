import { NextResponse } from "next/server";
import { requireDemoRepository } from "@/lib/github/require-demo-repository";
import { openTrustedRepairPullRequest } from "@/lib/repair/open-pr";
import { TRUSTED_REPAIR_EXPRESSION } from "@/lib/repair/trusted-repair";
import type { RepairErrorResponse, RepairOpenPrSuccessResponse } from "@/lib/repair/api-types";

export const runtime = "nodejs";

function jsonError(code: string, message: string, status: number) {
  const body: RepairErrorResponse = { ok: false, error: { code, message } };
  return NextResponse.json(body, { status });
}

/** Sortable, migration-style stamp (YYYYMMDDHHMMSS) used for the branch and file name. */
function migrationStamp(now: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return [
    now.getUTCFullYear(),
    pad(now.getUTCMonth() + 1),
    pad(now.getUTCDate()),
    pad(now.getUTCHours()),
    pad(now.getUTCMinutes()),
    pad(now.getUTCSeconds()),
  ].join("");
}

/**
 * Opens a real pull request on the demonstration repository containing the
 * one trusted, predefined repair.
 *
 * Like the apply route, this never accepts SQL from the request. The
 * committed migration is built from the fixed constants in
 * trusted-repair.ts, and reaching this route is itself the human-approval
 * step — the UI only offers the button once a person has approved the
 * proposal.
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
    const outcome = await openTrustedRepairPullRequest(gate.repository, {
      stamp: migrationStamp(new Date()),
    });

    if (!outcome.ok) {
      // A missing token is a configuration gap, not a server fault: the
      // rest of the repair flow still works, and the UI says so rather
      // than presenting this as a broken feature.
      const status = outcome.error === "TOKEN_MISSING" ? 503 : 502;
      return jsonError(outcome.error, outcome.message, status);
    }

    const responseBody: RepairOpenPrSuccessResponse = {
      ok: true,
      repository: `${gate.repository.owner}/${gate.repository.repo}`,
      pullRequestUrl: outcome.pullRequestUrl,
      branch: outcome.branch,
      filePath: outcome.filePath,
      committedExpression: TRUSTED_REPAIR_EXPRESSION,
    };
    return NextResponse.json(responseBody, { status: 200 });
  } catch {
    return jsonError("UNKNOWN", "An unexpected error occurred while opening the pull request.", 500);
  }
}
