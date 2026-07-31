import { NextResponse } from "next/server";
import { requireDemoRepository } from "@/lib/github/require-demo-repository";
import { readDemoSupabaseConfig, runLiveValidation } from "@/lib/supabase/live-validate";
import { getCurrentPolicyExpression } from "@/lib/repair/db-admin";
import { proposeRepair } from "@/lib/ai/repair-proposal";
import {
  REPAIR_TARGET_OPERATION,
  REPAIR_TARGET_ROLE,
  REPAIR_TARGET_TABLE,
  TRUSTED_REPAIR_EXPRESSION,
  isTrustedRepairExpression,
} from "@/lib/repair/trusted-repair";
import type { RepairErrorResponse, RepairProposeSuccessResponse } from "@/lib/repair/api-types";

export const runtime = "nodejs";

function jsonError(code: string, message: string, status: number) {
  const body: RepairErrorResponse = { ok: false, error: { code, message } };
  return NextResponse.json(body, { status });
}

/**
 * Proposes a repair for the one known demo vulnerability, grounded in a
 * freshly re-run live query (real cross-tenant rows, not remembered from an
 * earlier request) and a fresh read of the live policy's current
 * expression. If Gemini is unavailable or its proposal doesn't validate,
 * this is reported honestly — the response never claims AI analysis
 * occurred unless a real call actually succeeded.
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

  const config = readDemoSupabaseConfig();
  if (!config) {
    return jsonError(
      "SERVER_MISCONFIGURED",
      "The demo Supabase environment is not fully configured on the server.",
      500,
    );
  }

  try {
    const [validation, currentPolicy] = await Promise.all([
      runLiveValidation(config),
      getCurrentPolicyExpression(),
    ]);

    if (!validation.ok) {
      return jsonError(validation.error, validation.message, 502);
    }
    if (!currentPolicy.ok) {
      return jsonError(currentPolicy.error, currentPolicy.message, 502);
    }

    const repositoryLabel = `${gate.repository.owner}/${gate.repository.repo}`;
    const currentExpression = currentPolicy.expression;

    if (currentExpression !== null && isTrustedRepairExpression(currentExpression)) {
      const alreadyRepaired: RepairProposeSuccessResponse = {
        ok: true,
        repository: repositoryLabel,
        table: REPAIR_TARGET_TABLE,
        operation: REPAIR_TARGET_OPERATION,
        role: REPAIR_TARGET_ROLE,
        currentExpression,
        leakedRowCount: validation.leakedRowCount,
        alreadyRepaired: true,
        aiPerformed: false,
        provider: null,
        model: null,
        durationMs: null,
        explanation: null,
        proposedExpression: null,
        confidence: null,
        assumptions: null,
        valid: true,
        trustedExpression: TRUSTED_REPAIR_EXPRESSION,
      };
      return NextResponse.json(alreadyRepaired, { status: 200 });
    }

    const sample = validation.leakedRows[0];
    const proposal = await proposeRepair({
      currentExpression: currentExpression ?? "unknown",
      leakedRowCount: validation.leakedRowCount,
      sampleLeakedRowSummary: sample ? `${sample.name} (trainer_id ${sample.trainerId})` : null,
    });

    const responseBody: RepairProposeSuccessResponse = {
      ok: true,
      repository: repositoryLabel,
      table: REPAIR_TARGET_TABLE,
      operation: REPAIR_TARGET_OPERATION,
      role: REPAIR_TARGET_ROLE,
      currentExpression,
      leakedRowCount: validation.leakedRowCount,
      alreadyRepaired: false,
      aiPerformed: proposal.performed,
      provider: proposal.performed ? proposal.provider : null,
      model: proposal.performed ? proposal.model : null,
      durationMs: proposal.performed ? proposal.durationMs : null,
      explanation: proposal.performed ? proposal.explanation : null,
      proposedExpression: proposal.performed ? proposal.proposedExpression : null,
      confidence: proposal.performed ? proposal.confidence : null,
      assumptions: proposal.performed ? proposal.assumptions : null,
      valid: proposal.performed && proposal.valid,
      trustedExpression: TRUSTED_REPAIR_EXPRESSION,
    };

    return NextResponse.json(responseBody, { status: 200 });
  } catch {
    return jsonError("UNKNOWN", "An unexpected error occurred while proposing a repair.", 500);
  }
}
