import { NextResponse } from "next/server";
import { checkMutationReadiness } from "@/lib/repair/db-admin";
import type { RepairPreflightResponse } from "@/lib/repair/api-types";

export const runtime = "nodejs";

/**
 * Non-mutating readiness check for the local Supabase CLI mutation channel
 * that applyTrustedRepair/resetVulnerableState will use. The UI calls this
 * before offering "Approve and apply this fix" so a broken local CLI setup
 * (wrong PATH, wrong cwd, unlinked/mismatched project, unauthenticated
 * session) is surfaced as a specific, safe setup error instead of only
 * being discovered after a human clicks Apply.
 */
export async function GET() {
  try {
    const outcome = await checkMutationReadiness();
    const body: RepairPreflightResponse = outcome.ok
      ? { ok: true, ready: true }
      : { ok: true, ready: false, error: outcome.error, message: outcome.message };
    return NextResponse.json(body, { status: 200 });
  } catch {
    const body: RepairPreflightResponse = {
      ok: true,
      ready: false,
      error: "UNKNOWN",
      message: "An unexpected error occurred while checking whether the database mutation channel is ready.",
    };
    return NextResponse.json(body, { status: 200 });
  }
}
