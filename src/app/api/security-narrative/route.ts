import { NextResponse } from "next/server";
import { generateExecutiveNarrative } from "@/lib/ai/executive-narrative";
import type { UnifiedFinding } from "@/lib/security/finding";
import type { SecurityReport } from "@/lib/security/report";

export const runtime = "nodejs";

type RequestBody = {
  repository: string;
  report: SecurityReport;
  findings: UnifiedFinding[];
  liveVerificationSummary?: string | null;
};

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: { code: "INVALID_REQUEST", message: "Invalid JSON." } }, { status: 400 });
  }

  const parsed = body as RequestBody;
  if (typeof parsed.repository !== "string" || !parsed.report || !Array.isArray(parsed.findings)) {
    return NextResponse.json(
      { ok: false, error: { code: "INVALID_REQUEST", message: "repository, report, and findings are required." } },
      { status: 400 },
    );
  }

  const result = await generateExecutiveNarrative({
    repository: parsed.repository,
    report: parsed.report,
    findings: parsed.findings,
    liveVerificationSummary: parsed.liveVerificationSummary ?? null,
  });

  if (!result.performed) {
    return NextResponse.json(
      { ok: false, error: { code: "GEMINI_UNAVAILABLE", message: "Executive narrative is unavailable right now." } },
      { status: 503 },
    );
  }

  return NextResponse.json({
    ok: true,
    narrative: result.narrative,
    model: result.model,
    verifiedFindingCount: result.verifiedFindingCount,
  });
}
