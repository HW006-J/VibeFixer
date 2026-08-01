"use client";

import { useMemo, useState } from "react";
import { computeSecuritySummary, type LiveVerificationEvidence } from "@/lib/audit/summary";
import type { AuditCoverage, AuditFinding, AuditFindingTier } from "@/lib/audit/types";
import type { ScanErrorResponse } from "@/lib/scanner/api-types";
import type { ExecutiveNarrative } from "@/lib/ai/executive-narrative";
import { auditFindingToUnified } from "@/lib/security/from-audit";
import type { SecurityCategory, UnifiedFinding, UnifiedSeverity } from "@/lib/security/finding";
import { categoryLabel, formatReportAsMarkdown, type SecurityReport } from "@/lib/security/report";
import type { RepairOpenPrApiResponse } from "@/lib/repair/api-types";
import { findTrustedRepairTarget } from "@/lib/repair/trusted-repair";
import { SecurityDemoPanel } from "./security-demo-panel";

type SuccessState = {
  status: "success";
  repository: string;
  repositoryUrl: string;
  isDemoRepository: boolean;
  findings: AuditFinding[];
  unifiedFindings: UnifiedFinding[];
  securityReport: SecurityReport;
  coverage: AuditCoverage;
  durationMs: number;
  scanToken: number;
};

type ErrorState = {
  status: "error";
  error: ScanErrorResponse["error"];
};

export type ScanResultState = SuccessState | ErrorState;

type CategoryFilter = "all" | SecurityCategory | "review";

function pluralise(count: number, singular: string, plural: string): string {
  return count === 1 ? singular : plural;
}

function oneSentence(text: string): string {
  const match = /^[^.!?]*[.!?]/.exec(text.trim());
  return match ? match[0] : text;
}

function severityBadgeLabel(severity: UnifiedSeverity): string {
  if (severity === "review") return "needs review";
  return severity;
}

function severityCardClasses(severity: UnifiedSeverity): string {
  switch (severity) {
    case "critical":
      return "border-red-500/60 bg-red-950/40 text-red-100 shadow-[0_0_0_1px_rgba(239,68,68,0.15)]";
    case "high":
      return "border-orange-500/50 bg-orange-950/30 text-orange-100";
    case "medium":
      return "border-yellow-500/40 bg-yellow-950/20 text-yellow-100";
    case "review":
      return "border-amber-500/50 bg-amber-950/20 text-amber-100";
  }
}

function severityBadgeClasses(severity: UnifiedSeverity): string {
  switch (severity) {
    case "critical":
      return "bg-red-600 text-white";
    case "high":
      return "bg-orange-600 text-white";
    case "medium":
      return "bg-yellow-600 text-white";
    case "review":
      return "bg-amber-600 text-white";
  }
}

function overallRiskLabel(level: SecurityReport["overallRisk"]): string {
  switch (level) {
    case "critical":
      return "Critical risk detected";
    case "high":
      return "High risk detected";
    case "moderate":
      return "Needs review";
    case "low":
      return "No issue detected by the current Vibe Fixer rule set";
    case "none":
      return "Nothing to assess yet";
  }
}

function overallRiskClasses(level: SecurityReport["overallRisk"]): string {
  switch (level) {
    case "critical":
      return "border-red-500/60 bg-red-950/40 text-red-100";
    case "high":
      return "border-orange-500/50 bg-orange-950/30 text-orange-100";
    case "moderate":
      return "border-amber-500/50 bg-amber-950/20 text-amber-100";
    case "low":
      return "border-emerald-600/50 bg-emerald-950/30 text-emerald-100";
    case "none":
      return "border-zinc-700 bg-zinc-900/60 text-zinc-200";
  }
}

function PipelineFacts({ state }: { state: SuccessState }) {
  const { repository, coverage, durationMs, securityReport } = state;
  const facts = [
    `Repository scanned: ${repository}`,
    `${securityReport.filesInspected.length} ${pluralise(securityReport.filesInspected.length, "file", "files")} fetched from GitHub`,
    `${coverage.statementsInspected} SQL ${pluralise(coverage.statementsInspected, "statement", "statements")} inspected`,
    `${coverage.policiesInspected} RLS ${pluralise(coverage.policiesInspected, "policy", "policies")} across ${coverage.tablesDiscovered} ${pluralise(coverage.tablesDiscovered, "table", "tables")}`,
    `${securityReport.checksRun} deterministic checks run across ${securityReport.categoriesAssessed.join(", ") || "no categories"}`,
    ...(coverage.aiReviewsPerformed > 0 ? [`${coverage.aiReviewsPerformed} Supabase clauses reviewed by Gemini`] : []),
    `Completed in ${durationMs}ms`,
  ];

  return (
    <ul className="flex flex-col gap-1.5 text-xs text-zinc-400">
      {facts.map((fact) => (
        <li key={fact} className="flex items-center gap-2">
          <span className="h-1 w-1 shrink-0 rounded-full bg-zinc-600" aria-hidden="true" />
          {fact}
        </li>
      ))}
    </ul>
  );
}

function ExecutiveReportCard({
  report,
  supabaseSummary,
  liveEvidence,
}: {
  report: SecurityReport;
  supabaseSummary: ReturnType<typeof computeSecuritySummary>;
  liveEvidence: LiveVerificationEvidence | null;
}) {
  return (
    <div className={`rounded-lg border p-5 ${overallRiskClasses(report.overallRisk)}`}>
      <p className="text-xs font-semibold uppercase tracking-wide opacity-70">Executive security report</p>
      <p className="mt-1 text-lg font-bold">{overallRiskLabel(report.overallRisk)}</p>
      <p className="mt-1 text-sm">
        {report.counts.critical} critical · {report.counts.high} high · {report.counts.medium} medium ·{" "}
        {report.counts.review} needs review
      </p>
      <p className="mt-1 text-sm opacity-80">
        {report.filesInspected.length} files inspected · {report.checksRun} checks run
      </p>
      <p className="mt-1 text-sm opacity-80">
        Supabase: {supabaseSummary.policiesChecked} {pluralise(supabaseSummary.policiesChecked, "policy", "policies")} across{" "}
        {supabaseSummary.tablesChecked} {pluralise(supabaseSummary.tablesChecked, "table", "tables")}
      </p>

      {report.topFindings.length > 0 && (
        <div className="mt-3">
          <p className="text-xs font-semibold uppercase tracking-wide opacity-70">Top findings</p>
          <ul className="mt-1 flex flex-col gap-1 text-sm">
            {report.topFindings.map((f) => (
              <li key={f.id}>
                {f.title} ({categoryLabel(f.category)})
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="mt-3">
        <p className="text-xs font-semibold uppercase tracking-wide opacity-70">Live verification</p>
        <p className="mt-1 text-sm">
          {liveEvidence
            ? supabaseSummary.liveVerification.summary
            : "Not yet verified — run live validation below to confirm against the real database."}
        </p>
      </div>

      {report.recommendedRemediationPriority[0] && (
        <div className="mt-3">
          <p className="text-xs font-semibold uppercase tracking-wide opacity-70">Recommended remediation priority</p>
          <p className="mt-1 text-sm">{report.recommendedRemediationPriority[0]}</p>
        </div>
      )}
    </div>
  );
}

function CategoryBreakdown({ findings }: { findings: UnifiedFinding[] }) {
  const categories: SecurityCategory[] = ["supabase", "iam", "secret", "endpoint"];
  return (
    <div className="flex flex-wrap gap-2">
      {categories.map((cat) => {
        const count = findings.filter((f) => f.category === cat).length;
        return (
          <span
            key={cat}
            className="inline-flex items-center rounded-full border border-zinc-700 bg-zinc-900 px-3 py-1 text-xs text-zinc-300"
          >
            {categoryLabel(cat)}: {count}
          </span>
        );
      })}
    </div>
  );
}

function FilterBar({ filter, onChange }: { filter: CategoryFilter; onChange: (f: CategoryFilter) => void }) {
  const options: { id: CategoryFilter; label: string }[] = [
    { id: "all", label: "All" },
    { id: "supabase", label: "Supabase" },
    { id: "iam", label: "IAM" },
    { id: "secret", label: "Secrets" },
    { id: "endpoint", label: "Endpoints" },
    { id: "review", label: "Needs review" },
  ];
  return (
    <div className="flex flex-wrap gap-2">
      {options.map((opt) => (
        <button
          key={opt.id}
          type="button"
          onClick={() => onChange(opt.id)}
          className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
            filter === opt.id ? "bg-red-600 text-white" : "border border-zinc-700 bg-zinc-900 text-zinc-300 hover:border-zinc-500"
          }`}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}

function UnifiedFindingCard({
  finding,
  auditFinding,
  isDemoRepository,
}: {
  finding: UnifiedFinding;
  auditFinding?: AuditFinding;
  isDemoRepository: boolean;
}) {
  return (
    <div className="flex flex-col gap-2">
      <div role="alert" className={`rounded-lg border p-5 ${severityCardClasses(finding.severity)}`}>
        <div className="flex flex-wrap items-center gap-2">
          <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold uppercase tracking-wide ${severityBadgeClasses(finding.severity)}`}>
            {severityBadgeLabel(finding.severity)}
          </span>
          <span className="inline-flex items-center rounded-full border border-current/30 px-2.5 py-0.5 text-xs opacity-80">
            {categoryLabel(finding.category)}
          </span>
          <span className="inline-flex items-center rounded-full border border-current/30 px-2.5 py-0.5 text-xs font-mono opacity-80">
            {finding.ruleId}
          </span>
        </div>

        <h3 className="mt-3 text-lg font-semibold">{finding.title}</h3>
        <p className="mt-2 text-sm leading-relaxed opacity-90">{oneSentence(finding.impact)}</p>

        <p className="mt-3 text-sm leading-relaxed">
          <span className="font-semibold">Recommended action: </span>
          {finding.recommendation}
        </p>

        {auditFinding?.aiReview && (
          <div className="mt-3 rounded-md border border-amber-500/50 bg-amber-950/30 p-3 text-amber-100">
            <p className="text-xs font-semibold uppercase tracking-wide">
              Gemini semantic review ({auditFinding.aiReview.model})
            </p>
            <p className="mt-1 text-sm leading-relaxed">{auditFinding.aiReview.reasoning}</p>
          </div>
        )}

        <details className="mt-4 text-xs opacity-70">
          <summary className="cursor-pointer select-none">Technical details</summary>
          <dl className="mt-3 flex flex-col gap-3 text-sm">
            <div>
              <dt className="opacity-70">File</dt>
              <dd className="mt-0.5 break-all font-mono">
                {finding.filePath}:{finding.startLine}
                {finding.endLine !== finding.startLine ? `-${finding.endLine}` : ""}
              </dd>
            </div>
            <div>
              <dt className="opacity-70">Verification</dt>
              <dd className="mt-0.5">{finding.verification.replace("_", " ")}</dd>
            </div>
            {finding.assumptions && (
              <div>
                <dt className="opacity-70">Assumptions</dt>
                <dd className="mt-0.5 leading-relaxed">{finding.assumptions}</dd>
              </div>
            )}
            <div>
              <dt className="opacity-70">Redacted evidence</dt>
              <dd className="mt-1">
                <pre className="overflow-x-auto rounded-md bg-black/60 p-3 text-xs">
                  <code>{finding.redactedEvidence}</code>
                </pre>
              </dd>
            </div>
          </dl>
        </details>
      </div>

      {finding.severity === "critical" && finding.category === "supabase" && (
        <span className="inline-flex w-fit items-center rounded-full border border-zinc-700 bg-zinc-900 px-2.5 py-0.5 text-xs text-zinc-400">
          {finding.liveValidationAvailable
            ? "Static repository finding — run live validation below to confirm on the deployed database"
            : isDemoRepository
              ? "Static repository finding — live testing is not available for this specific finding"
              : "Static repository finding — live deployment not tested"}
        </span>
      )}
    </div>
  );
}

function ReportActions({
  state,
  displayFindings,
}: {
  state: SuccessState;
  displayFindings: UnifiedFinding[];
}) {
  const markdown = formatReportAsMarkdown(state.securityReport, displayFindings);

  // Offered only where a trusted, predefined repair genuinely addresses a
  // finding in this scan. There is exactly one such repair, so this is
  // never a "fix everything" action and must not read like one — the other
  // findings in the report still need a human.
  const repairTarget = state.isDemoRepository ? findTrustedRepairTarget(state.findings) : null;

  function copyReport() {
    void navigator.clipboard.writeText(markdown);
  }

  function downloadMarkdown() {
    const blob = new Blob([markdown], { type: "text/markdown" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `vibe-fixer-report-${state.repository.replace("/", "-")}.md`;
    anchor.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="flex flex-wrap gap-2">
      <button
        type="button"
        onClick={copyReport}
        className="rounded-md border border-zinc-700 bg-zinc-900 px-3 py-1.5 text-xs font-medium text-zinc-200 hover:border-zinc-500"
      >
        Copy report
      </button>
      <button
        type="button"
        onClick={downloadMarkdown}
        className="rounded-md border border-zinc-700 bg-zinc-900 px-3 py-1.5 text-xs font-medium text-zinc-200 hover:border-zinc-500"
      >
        Download Markdown
      </button>

      {repairTarget && <OpenRepairPrButton repositoryUrl={state.repositoryUrl} target={repairTarget} />}
    </div>
  );
}

/**
 * Opens a pull request containing the one trusted, predefined repair.
 *
 * The wording is deliberately narrow. This fixes a single named policy on a
 * single named table — it is not a remedy for the rest of the report, and
 * a button that implied otherwise would be the most damaging kind of
 * overclaim this product could make.
 */
function OpenRepairPrButton({ repositoryUrl, target }: { repositoryUrl: string; target: AuditFinding }) {
  const [status, setStatus] = useState<"idle" | "opening" | "opened" | "error">("idle");
  const [url, setUrl] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  async function openPr() {
    setStatus("opening");
    setMessage(null);
    try {
      const response = await fetch("/api/repair/open-pr", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ repositoryUrl }),
      });
      const data = (await response.json()) as RepairOpenPrApiResponse;
      if (!data.ok) {
        setStatus("error");
        setMessage(data.error.message);
        return;
      }
      setUrl(data.pullRequestUrl);
      setStatus("opened");
    } catch {
      setStatus("error");
      setMessage("Could not reach the pull request service.");
    }
  }

  if (status === "opened" && url) {
    return (
      <a
        href={url}
        target="_blank"
        rel="noreferrer"
        className="rounded-md border border-emerald-700 bg-emerald-950 px-3 py-1.5 text-xs font-medium text-emerald-200 hover:border-emerald-500"
      >
        Pull request opened — view on GitHub
      </a>
    );
  }

  return (
    <div className="flex flex-col gap-1">
      <button
        type="button"
        onClick={openPr}
        disabled={status === "opening"}
        className="rounded-md border border-emerald-700 bg-emerald-950 px-3 py-1.5 text-xs font-medium text-emerald-200 hover:border-emerald-500 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {status === "opening" ? "Opening pull request…" : "Open pull request with the trusted fix"}
      </button>
      <span className="text-[11px] text-zinc-500">
        Fixes one finding: {target.title}. Other findings in this report still need a human.
      </span>
      {status === "error" && message && (
        <span role="alert" className="text-[11px] text-amber-300">
          {message}
        </span>
      )}
    </div>
  );
}

function GeminiNarrativeSection({ state, liveEvidence }: { state: SuccessState; liveEvidence: LiveVerificationEvidence | null }) {
  const [loading, setLoading] = useState(false);
  const [narrative, setNarrative] = useState<ExecutiveNarrative | null>(null);
  const [verifiedCount, setVerifiedCount] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function generateSummary() {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch("/api/security-narrative", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          repository: state.repository,
          report: state.securityReport,
          findings: state.unifiedFindings,
          liveVerificationSummary: liveEvidence
            ? liveEvidence.leakedRowCount > 0
              ? `${liveEvidence.leakedRowCount} cross-tenant rows exposed`
              : "0 cross-tenant rows exposed"
            : null,
        }),
      });
      const data = (await response.json()) as {
        ok: boolean;
        narrative?: ExecutiveNarrative;
        verifiedFindingCount?: number;
        error?: { message: string };
      };
      if (!data.ok || !data.narrative) {
        setError(data.error?.message ?? "Executive narrative unavailable.");
        return;
      }
      setNarrative(data.narrative);
      setVerifiedCount(data.verifiedFindingCount ?? state.unifiedFindings.length);
    } catch {
      setError("Could not reach the narrative service.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="rounded-lg border border-zinc-800 bg-zinc-900/60 p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm font-medium text-zinc-200">AI executive narrative</p>
        <button
          type="button"
          disabled={loading}
          onClick={() => void generateSummary()}
          className="rounded-md bg-zinc-800 px-3 py-1.5 text-xs font-semibold text-zinc-100 hover:bg-zinc-700 disabled:opacity-60"
        >
          {loading ? "Generating…" : "Generate AI summary"}
        </button>
      </div>
      {error && <p className="mt-2 text-sm text-amber-300">{error}</p>}
      {narrative && (
        <div className="mt-3 flex flex-col gap-2 text-sm text-zinc-300">
          <p className="text-xs text-zinc-500">
            Generated from {state.unifiedFindings.length} scanned{" "}
            {pluralise(state.unifiedFindings.length, "finding", "findings")} · {verifiedCount ?? 0} live-verified{" "}
            {pluralise(verifiedCount ?? 0, "finding", "findings")}
          </p>
          <p>{narrative.executiveSummary}</p>
          <p className="text-xs opacity-80">{narrative.blastRadiusSummary}</p>
          <p className="text-xs opacity-70">{narrative.uncertainty}</p>
        </div>
      )}
    </div>
  );
}

function applyLiveEvidence(findings: UnifiedFinding[], liveEvidence: LiveVerificationEvidence | null): UnifiedFinding[] {
  if (!liveEvidence) return findings;
  return findings.map((f) =>
    f.liveValidationAvailable ? { ...f, verification: "live_verified" as const } : f,
  );
}

function matchesFilter(finding: UnifiedFinding, filter: CategoryFilter): boolean {
  if (filter === "all") return true;
  if (filter === "review") return finding.severity === "review" || finding.verification === "needs_review";
  return finding.category === filter;
}

export function ScanResult({ state }: { state: ScanResultState }) {
  const [liveEvidence, setLiveEvidence] = useState<LiveVerificationEvidence | null>(null);
  const [filter, setFilter] = useState<CategoryFilter>("all");

  const successState = state.status === "success" ? state : null;

  const displayFindings = useMemo(() => {
    if (!successState) return [];
    return applyLiveEvidence(successState.unifiedFindings, liveEvidence);
  }, [successState, liveEvidence]);

  const auditByUnifiedId = useMemo(() => {
    const map = new Map<string, AuditFinding>();
    if (!successState) return map;
    for (const f of successState.findings) {
      map.set(auditFindingToUnified(f).id, f);
    }
    return map;
  }, [successState]);

  if (state.status === "error") {
    return (
      <div role="alert" className="rounded-lg border border-amber-500/50 bg-amber-950/30 p-5 text-amber-100">
        <p className="text-sm font-semibold uppercase tracking-wide text-amber-300">Scan failed</p>
        <p className="mt-2 text-sm leading-relaxed">{state.error.message}</p>
      </div>
    );
  }

  const { findings, securityReport, coverage, repository, repositoryUrl, isDemoRepository, scanToken } = state;

  const filteredFindings = displayFindings.filter((f) => matchesFilter(f, filter));

  const supabaseSummary = computeSecuritySummary(
    { repository: state.repository, isDemoRepository, findings, coverage, durationMs: state.durationMs },
    liveEvidence,
  );

  function liveSection(sourceState: "finding_present" | "no_finding") {
    if (!isDemoRepository) {
      return (
        <div className="rounded-lg border border-zinc-700 bg-zinc-900/60 p-4 text-sm text-zinc-400">
          Live validation requires an authorised connected test environment.
        </div>
      );
    }
    return (
      <SecurityDemoPanel
        repositoryUrl={repositoryUrl}
        refreshToken={scanToken}
        sourceState={sourceState}
        onLiveEvidence={setLiveEvidence}
      />
    );
  }

  if (coverage.filesScanned.length === 0) {
    return (
      <div className="flex flex-col gap-4">
        <div className="rounded-lg border border-zinc-700 bg-zinc-900/60 p-5 text-zinc-200">
          <p className="text-sm font-semibold uppercase tracking-wide text-zinc-400">No scannable files found</p>
          <p className="mt-2 text-sm leading-relaxed">
            No supported Supabase SQL, IAM JSON, API routes, or configuration files matched the bounded fetch rules in{" "}
            <span className="font-mono">{repository}</span>.
          </p>
        </div>
      </div>
    );
  }

  const criticalSupabase = findings.filter((f) => f.tier === "critical");
  const topIds = new Set(securityReport.topFindings.map((f) => f.id));
  const remainingFindings = filteredFindings.filter((f) => !topIds.has(f.id));

  const severityOrder: Record<UnifiedSeverity, number> = { critical: 0, high: 1, medium: 2, review: 3 };
  const sortedFiltered = [...filteredFindings].sort((a, b) => severityOrder[a.severity] - severityOrder[b.severity]);
  const topFiltered = sortedFiltered.filter((f) => topIds.has(f.id));

  return (
    <div className="flex flex-col gap-4">
      <ExecutiveReportCard report={securityReport} supabaseSummary={supabaseSummary} liveEvidence={liveEvidence} />
      <CategoryBreakdown findings={displayFindings} />
      <ReportActions state={state} displayFindings={displayFindings} />
      <FilterBar filter={filter} onChange={setFilter} />

      {topFiltered.length > 0 && (
        <div className="flex flex-col gap-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-zinc-400">Top findings</p>
          {topFiltered.map((finding) => (
            <UnifiedFindingCard
              key={finding.id}
              finding={finding}
              auditFinding={auditByUnifiedId.get(finding.id)}
              isDemoRepository={isDemoRepository}
            />
          ))}
        </div>
      )}

      {criticalSupabase.length > 0 && liveSection("finding_present")}

      {remainingFindings.length > 0 && (
        <div className="flex flex-col gap-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-zinc-400">All findings</p>
          {[...remainingFindings]
            .sort((a, b) => severityOrder[a.severity] - severityOrder[b.severity])
            .map((finding) => (
              <UnifiedFindingCard
                key={finding.id}
                finding={finding}
                auditFinding={auditByUnifiedId.get(finding.id)}
                isDemoRepository={isDemoRepository}
              />
            ))}
        </div>
      )}

      {displayFindings.length === 0 && (
        <div className="rounded-lg border border-emerald-600/50 bg-emerald-950/30 p-5 text-emerald-100">
          <p className="text-sm font-semibold uppercase tracking-wide text-emerald-300">No issues flagged</p>
          <p className="mt-2 text-sm leading-relaxed">
            No issue detected by the current Vibe Fixer rule set across{" "}
            {securityReport.categoriesAssessed.join(", ") || "available categories"} in{" "}
            <span className="font-mono">{repository}</span>.
          </p>
        </div>
      )}

      {displayFindings.length === 0 && liveSection("no_finding")}

      <details className="text-xs text-zinc-500">
        <summary className="cursor-pointer select-none">Technical details</summary>
        <div className="mt-3">
          <PipelineFacts state={state} />
          {securityReport.unsupportedOrMissingContext.length > 0 && (
            <ul className="mt-3 flex flex-col gap-1 text-xs text-zinc-500">
              {securityReport.unsupportedOrMissingContext.map((note) => (
                <li key={note}>{note}</li>
              ))}
            </ul>
          )}
        </div>
      </details>

      <GeminiNarrativeSection state={state} liveEvidence={liveEvidence} />
    </div>
  );
}

// Re-export for tests that reference AuditFindingTier helpers
export type { AuditFindingTier };
