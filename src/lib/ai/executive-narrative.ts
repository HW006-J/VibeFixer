import { generateStructuredJson } from "./generate-structured";
import type { SecurityReport } from "@/lib/security/report";
import type { UnifiedFinding } from "@/lib/security/finding";

export type ExecutiveNarrativeInput = {
  repository: string;
  report: SecurityReport;
  findings: UnifiedFinding[];
  liveVerificationSummary: string | null;
};

export type ExecutiveNarrative = {
  executiveSummary: string;
  blastRadiusSummary: string;
  prioritisedFindingIds: string[];
  remediationOrder: string[];
  uncertainty: string;
  missingContext: string[];
};

const NARRATIVE_SCHEMA = {
  type: "object",
  properties: {
    executiveSummary: { type: "string" },
    blastRadiusSummary: { type: "string" },
    prioritisedFindingIds: { type: "array", items: { type: "string" } },
    remediationOrder: { type: "array", items: { type: "string" } },
    uncertainty: { type: "string" },
    missingContext: { type: "array", items: { type: "string" } },
  },
  required: [
    "executiveSummary",
    "blastRadiusSummary",
    "prioritisedFindingIds",
    "remediationOrder",
    "uncertainty",
    "missingContext",
  ],
  additionalProperties: false,
};

function buildPrompt(input: ExecutiveNarrativeInput): string {
  const verifiedIds = new Set(input.report.liveVerifiedFindingIds);
  const payload = {
    repository: input.repository,
    coverage: {
      filesInspected: input.report.filesInspected.length,
      categoriesAssessed: input.report.categoriesAssessed,
      checksRun: input.report.checksRun,
    },
    counts: input.report.counts,
    liveVerificationSummary: input.liveVerificationSummary,
    findings: input.findings.map((f) => ({
      id: f.id,
      category: f.category,
      title: f.title,
      severity: f.severity,
      impact: f.impact,
      redactedEvidence: f.redactedEvidence,
      assumptions: f.assumptions,
      verification: verifiedIds.has(f.id) ? "live_verified" : f.verification,
    })),
    unsupportedContext: input.report.unsupportedOrMissingContext,
  };

  return [
    "You are summarising a deterministic Vibe Fixer security scan for executives.",
    "Use ONLY the finding IDs and facts in the JSON below. Do not invent vulnerabilities or IDs.",
    "Return JSON matching the schema.",
    JSON.stringify(payload),
  ].join("\n\n");
}

function sanitiseFindingIds(
  narrative: ExecutiveNarrative,
  validIds: Set<string>,
): ExecutiveNarrative {
  return {
    ...narrative,
    prioritisedFindingIds: narrative.prioritisedFindingIds.filter((id) => validIds.has(id)),
  };
}

export async function generateExecutiveNarrative(
  input: ExecutiveNarrativeInput,
): Promise<{ performed: true; narrative: ExecutiveNarrative; model: string; verifiedFindingCount: number } | { performed: false }> {
  const validIds = new Set(input.findings.map((f) => f.id));
  const verifiedFindingCount = input.findings.filter(
    (f) => f.verification === "live_verified" || input.report.liveVerifiedFindingIds.includes(f.id),
  ).length;

  const result = await generateStructuredJson<ExecutiveNarrative>({
    prompt: buildPrompt(input),
    schema: NARRATIVE_SCHEMA,
  });

  if (!result.performed) return { performed: false };

  const narrative = sanitiseFindingIds(result.data, validIds);
  return { performed: true, narrative, model: result.model, verifiedFindingCount };
}
