import type { SecurityCategory, UnifiedFinding, UnifiedSeverity } from "./finding";

export type SecurityRiskLevel = "critical" | "high" | "moderate" | "low" | "none";

export type SecurityReport = {
  overallRisk: SecurityRiskLevel;
  repository: string;
  filesInspected: string[];
  categoriesAssessed: string[];
  checksRun: number;
  counts: {
    critical: number;
    high: number;
    medium: number;
    review: number;
  };
  topFindings: UnifiedFinding[];
  liveVerifiedFindingIds: string[];
  recommendedRemediationPriority: string[];
  unsupportedOrMissingContext: string[];
};

const SEVERITY_ORDER: Record<UnifiedSeverity, number> = {
  critical: 0,
  high: 1,
  medium: 2,
  review: 3,
};

function computeOverallRisk(findings: UnifiedFinding[]): SecurityRiskLevel {
  if (findings.some((f) => f.severity === "critical")) return "critical";
  if (findings.some((f) => f.severity === "high")) return "high";
  if (findings.some((f) => f.severity === "medium" || f.severity === "review")) return "moderate";
  if (findings.length === 0) return "low";
  return "none";
}

function sortFindings(findings: UnifiedFinding[]): UnifiedFinding[] {
  return [...findings].sort((a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity]);
}

export function buildSecurityReport(input: {
  repository: string;
  filesInspected: string[];
  unifiedFindings: UnifiedFinding[];
  checksRun: number;
  categoriesAssessed: string[];
  unsupportedContext: string[];
}): SecurityReport {
  const sorted = sortFindings(input.unifiedFindings);
  const counts = {
    critical: sorted.filter((f) => f.severity === "critical").length,
    high: sorted.filter((f) => f.severity === "high").length,
    medium: sorted.filter((f) => f.severity === "medium").length,
    review: sorted.filter((f) => f.severity === "review").length,
  };

  const topFindings = sorted.slice(0, 3);
  const recommendedRemediationPriority = sorted.slice(0, 5).map((f) => f.recommendation);

  return {
    overallRisk: computeOverallRisk(sorted),
    repository: input.repository,
    filesInspected: input.filesInspected,
    categoriesAssessed: input.categoriesAssessed,
    checksRun: input.checksRun,
    counts,
    topFindings,
    liveVerifiedFindingIds: sorted.filter((f) => f.verification === "live_verified").map((f) => f.id),
    recommendedRemediationPriority,
    unsupportedOrMissingContext: input.unsupportedContext,
  };
}

export function categoryLabel(category: SecurityCategory): string {
  switch (category) {
    case "supabase":
      return "Supabase";
    case "iam":
      return "IAM";
    case "secret":
      return "Secrets";
    case "endpoint":
      return "Endpoints";
  }
}

export function applyLiveVerificationToFindings(
  findings: UnifiedFinding[],
  liveVerifiedIds: string[],
): UnifiedFinding[] {
  const idSet = new Set(liveVerifiedIds);
  return findings.map((f) =>
    idSet.has(f.id) ? { ...f, verification: "live_verified" as const } : f,
  );
}

export function formatReportAsMarkdown(report: SecurityReport, findings: UnifiedFinding[]): string {
  const lines: string[] = [
    `# Vibe Fixer security report — ${report.repository}`,
    "",
    `**Overall risk:** ${report.overallRisk}`,
    "",
    "## Coverage",
    `- Files inspected: ${report.filesInspected.length}`,
    `- Categories: ${report.categoriesAssessed.join(", ") || "none"}`,
    `- Checks run: ${report.checksRun}`,
    "",
    "## Counts",
    `- Critical: ${report.counts.critical}`,
    `- High: ${report.counts.high}`,
    `- Medium: ${report.counts.medium}`,
    `- Needs review: ${report.counts.review}`,
    "",
    "## Top findings",
  ];

  for (const f of report.topFindings) {
    lines.push(`- **${f.title}** (${f.severity}, ${f.category})`);
  }

  lines.push("", "## All findings");
  for (const f of findings) {
    lines.push(`### ${f.title}`, `- Severity: ${f.severity}`, `- Category: ${f.category}`, `- File: ${f.filePath}:${f.startLine}`, `- ${f.impact}`, "");
  }

  if (report.unsupportedOrMissingContext.length > 0) {
    lines.push("## Missing context", ...report.unsupportedOrMissingContext.map((n) => `- ${n}`));
  }

  return lines.join("\n");
}
