import { NextResponse } from "next/server";
import { requireDemoRepository } from "@/lib/github/require-demo-repository";
import { determineLiveDemoState } from "@/lib/repair/live-state";
import type { LiveStateSuccessResponse, RepairErrorResponse } from "@/lib/repair/api-types";

export const runtime = "nodejs";

function jsonError(code: string, message: string, status: number) {
  const body: RepairErrorResponse = { ok: false, error: { code, message } };
  return NextResponse.json(body, { status });
}

/**
 * Derives the demo database's real current state (vulnerable / protected /
 * unexpected / unavailable) from live evidence — the deployed policy
 * expression plus a fresh authenticated Trainer A query — rather than
 * trusting anything a browser remembers about a prior apply/reset. Gated
 * like every other repair-flow route to the one configured demo
 * repository; the underlying Supabase inspection never accepts a
 * caller-supplied project, schema, table, or policy identifier — it always
 * inspects the one fixed demo table via trusted-repair.ts's constants.
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
    const state = await determineLiveDemoState();
    const responseBody: LiveStateSuccessResponse = { ok: true, ...state };
    return NextResponse.json(responseBody, { status: 200 });
  } catch {
    return jsonError("UNKNOWN", "An unexpected error occurred while checking the live database state.", 500);
  }
}
