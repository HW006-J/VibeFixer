import { NextResponse } from "next/server";
import { detectDeploymentCapabilities } from "@/lib/deployment/capabilities";
import type { DeploymentCapabilitiesResponse } from "@/lib/deployment/api-types";

export const runtime = "nodejs";

/**
 * Reports what this specific running deployment can actually do, derived
 * from real server-side signals (env config presence, and — off Vercel —
 * a genuine CLI readiness probe) rather than assumed. Not gated to the
 * demo repository: this describes platform capability, not a specific
 * scan or database operation, and reveals no secrets — only booleans and
 * a generic explanatory sentence.
 */
export async function GET() {
  const capabilities = await detectDeploymentCapabilities();
  const body: DeploymentCapabilitiesResponse = { ok: true, ...capabilities };
  return NextResponse.json(body, { status: 200 });
}
