"use client";

import { useState } from "react";
import { computeSecuritySummary, type LiveVerificationEvidence } from "@/lib/audit/summary";
import type { AuditCoverage, AuditFinding, AuditFindingTier } from "@/lib/audit/types";
import type { ScanErrorResponse } from "@/lib/scanner/api-types";
import { SecurityDemoPanel } from "./security-demo-panel";

type SuccessState = {
  status: "success";
  repository: string;
  repositoryUrl: string;
  isDemoRepository: boolean;
  findings: AuditFinding[];
  coverage: AuditCoverage;
  durationMs: number;
  /** Incremented on every scan submission (even of the same URL) — forces SecurityDemoPanel to re-derive live state from the server rather than showing a result from a previous scan. */
  scanToken: number;
};

type ErrorState = {
  status: "error";
  error: ScanErrorResponse["error"];
};

export type ScanResultState = SuccessState | ErrorState;

function pluralise(count: number, singular: string, plural: string): string {
  return count === 1 ? singular : plural;
}

function oneSentence(text: string): string {
  const match = /^[^.!?]*[.!?]/.exec(text.trim());
  return match ? match[0] : text;
}

/**
 * A checklist of facts already confirmed by the real server response.
 * Kept under Technical details — it's parser-level detail (file/statement
 * counts, timing), not something needed to follow the 2-3 minute demo.
 */
function PipelineFacts({ state }: { state: SuccessState }) {
  const { repository, coverage, durationMs } = state;

  const facts = [
    `Repository scanned: ${repository}`,
    `${coverage.filesScanned.length} SQL ${pluralise(coverage.filesScanned.length, "file", "files")} fetched from GitHub`,
    `${coverage.statementsInspected} SQL ${pluralise(coverage.statementsInspected, "statement", "statements")} inspected`,
    `${coverage.policiesInspected} RLS ${pluralise(coverage.policiesInspected, "policy", "policies")} discovered across ${coverage.tablesDiscovered} ${pluralise(coverage.tablesDiscovered, "table", "tables")}`,
    ...(coverage.aiReviewsPerformed > 0
      ? [`${coverage.aiReviewsPerformed} reviewed by a real Gemini model call`]
      : []),
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

function riskLevelLabel(level: ReturnType<typeof computeSecuritySummary>["riskLevel"]): string {
  switch (level) {
    case "critical":
      return "Critical risk detected";
    case "high":
      return "High risk detected";
    case "moderate":
      return "Needs review";
    case "low":
      return "No known issues detected";
    case "none":
      return "Nothing to assess yet";
  }
}

function riskLevelClasses(level: ReturnType<typeof computeSecuritySummary>["riskLevel"]): string {
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

/**
 * The executive summary: understandable at a glance, without opening any
 * technical details. Every number and claim here comes directly from the
 * real scan report (and, once available, real live-validation evidence
 * threaded up from SecurityDemoPanel) — never a separate model call.
 */
function SecuritySummaryCard({ state, liveEvidence }: { state: SuccessState; liveEvidence: LiveVerificationEvidence | null }) {
  const summary = computeSecuritySummary(
    { repository: state.repository, isDemoRepository: state.isDemoRepository, findings: state.findings, coverage: state.coverage, durationMs: state.durationMs },
    liveEvidence,
  );

  return (
    <div className={`rounded-lg border p-5 ${riskLevelClasses(summary.riskLevel)}`}>
      <p className="text-xs font-semibold uppercase tracking-wide opacity-70">Security summary</p>
      <p className="mt-1 text-lg font-bold">{riskLevelLabel(summary.riskLevel)}</p>
      <p className="mt-1 text-sm">
        {summary.criticalCount} critical · {summary.highCount} high · {summary.needsReviewCount} needs review
      </p>
      <p className="mt-1 text-sm opacity-80">
        {summary.policiesChecked} {pluralise(summary.policiesChecked, "policy", "policies")} checked across{" "}
        {summary.tablesChecked} {pluralise(summary.tablesChecked, "table", "tables")} ({summary.checksRun} deterministic
        checks run)
      </p>

      {summary.topRisks.length > 0 && (
        <div className="mt-3">
          <p className="text-xs font-semibold uppercase tracking-wide opacity-70">
            {summary.topRisks.length === 1 ? "Top issue" : "Top issues"}
          </p>
          <ul className="mt-1 flex flex-col gap-1 text-sm">
            {summary.topRisks.map((risk) => (
              <li key={risk}>{risk}</li>
            ))}
          </ul>
        </div>
      )}

      <div className="mt-3">
        <p className="text-xs font-semibold uppercase tracking-wide opacity-70">Live verification</p>
        <p className="mt-1 text-sm">
          {summary.liveVerification.performed
            ? summary.liveVerification.summary
            : "Not yet verified — run live validation below to confirm against the real database."}
        </p>
      </div>

      {summary.recommendedNextStep && (
        <div className="mt-3">
          <p className="text-xs font-semibold uppercase tracking-wide opacity-70">Recommended next step</p>
          <p className="mt-1 text-sm">{summary.recommendedNextStep}</p>
        </div>
      )}

      <p className="mt-4 text-xs leading-relaxed opacity-60">
        Checks discovered Supabase policies and schema objects against common access-control failure patterns.
        Complex or ambiguous cases are marked for review.
      </p>
    </div>
  );
}

function assessmentLabel(assessment: "likely_safe" | "likely_unsafe" | "uncertain"): string {
  switch (assessment) {
    case "likely_safe":
      return "Likely safe";
    case "likely_unsafe":
      return "Likely unsafe";
    case "uncertain":
      return "Uncertain";
  }
}

function assessmentClasses(assessment: "likely_safe" | "likely_unsafe" | "uncertain"): string {
  switch (assessment) {
    case "likely_safe":
      return "border-emerald-500/50 bg-emerald-950/30 text-emerald-200";
    case "likely_unsafe":
      return "border-red-500/50 bg-red-950/30 text-red-200";
    case "uncertain":
      return "border-amber-500/50 bg-amber-950/30 text-amber-200";
  }
}

function tierBadgeLabel(tier: AuditFindingTier): string {
  switch (tier) {
    case "critical":
      return "critical";
    case "high":
      return "high";
    case "review":
      return "needs review";
  }
}

function tierCardClasses(tier: AuditFindingTier): string {
  switch (tier) {
    case "critical":
      return "border-red-500/60 bg-red-950/40 text-red-100 shadow-[0_0_0_1px_rgba(239,68,68,0.15)]";
    case "high":
      return "border-orange-500/50 bg-orange-950/30 text-orange-100";
    case "review":
      return "border-amber-500/50 bg-amber-950/20 text-amber-100";
  }
}

function tierBadgeClasses(tier: AuditFindingTier): string {
  switch (tier) {
    case "critical":
      return "bg-red-600 text-white";
    case "high":
      return "bg-orange-600 text-white";
    case "review":
      return "bg-amber-600 text-white";
  }
}

function objectLabel(finding: AuditFinding): string {
  const kind = finding.objectType === "view" ? "View" : finding.objectType === "function" ? "Function" : "Table";
  const name = finding.table ?? (finding.evidence.match(/"?([A-Za-z0-9_."]+)"?\s*\(/)?.[1] ?? null) ?? "unknown";
  return `${kind}: ${name}`;
}

/**
 * A single finding card, used for every tier (critical/high/needs review).
 * Shows only what's needed to follow the demo at a glance — severity,
 * plain-English title, one-sentence impact, affected object, operation and
 * role, and the recommended action. Raw SQL, file/line, assumptions, and
 * parser-level detail live behind "Technical details", collapsed by
 * default.
 */
function FindingCard({ finding, isDemoRepository }: { finding: AuditFinding; isDemoRepository: boolean }) {
  return (
    <div className="flex flex-col gap-2">
      <div role="alert" className={`rounded-lg border p-5 ${tierCardClasses(finding.tier)}`}>
        <div className="flex flex-wrap items-center gap-2">
          <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold uppercase tracking-wide ${tierBadgeClasses(finding.tier)}`}>
            {tierBadgeLabel(finding.tier)}
          </span>
          <span className="inline-flex items-center rounded-full border border-current/30 px-2.5 py-0.5 text-xs font-mono opacity-80">
            {finding.ruleId}
          </span>
        </div>

        <h3 className="mt-3 text-lg font-semibold">{finding.title}</h3>
        <p className="mt-2 text-sm leading-relaxed opacity-90">{oneSentence(finding.explanation)}</p>

        <dl className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs opacity-80">
          <div>{objectLabel(finding)}</div>
          {finding.operation && <div>Operation: {finding.operation}</div>}
          {finding.role && <div>Role: {finding.role}</div>}
        </dl>

        <p className="mt-3 text-sm leading-relaxed">
          <span className="font-semibold">Recommended action: </span>
          {finding.remediation}
        </p>

        {finding.aiReview && (
          <div className={`mt-3 rounded-md border p-3 ${assessmentClasses(finding.aiReview.assessment)}`}>
            <p className="text-xs font-semibold uppercase tracking-wide">
              Gemini semantic review ({finding.aiReview.model}) — {assessmentLabel(finding.aiReview.assessment)}
            </p>
            <p className="mt-1 text-sm leading-relaxed">{finding.aiReview.reasoning}</p>
            <p className="mt-2 text-xs opacity-70">An AI opinion, not a guarantee. It does not replace manual review.</p>
          </div>
        )}

        <details className="mt-4 text-xs opacity-70">
          <summary className="cursor-pointer select-none">Technical details</summary>
          <dl className="mt-3 flex flex-col gap-3 text-sm">
            <div className="min-w-0">
              <dt className="opacity-70">File</dt>
              <dd className="mt-0.5 break-all font-mono">
                {finding.filePath}:{finding.line}
                {finding.endLine && finding.endLine !== finding.line ? `-${finding.endLine}` : ""}
              </dd>
            </div>
            <div className="min-w-0">
              <dt className="opacity-70">Full explanation</dt>
              <dd className="mt-0.5 leading-relaxed">{finding.explanation}</dd>
            </div>
            {finding.assumptions && (
              <div className="min-w-0">
                <dt className="opacity-70">Assumptions</dt>
                <dd className="mt-0.5 leading-relaxed">{finding.assumptions}</dd>
              </div>
            )}
            {finding.expression && (
              <div className="min-w-0">
                <dt className="opacity-70">{finding.clause} expression</dt>
                <dd className="mt-1">
                  <pre className="overflow-x-auto rounded-md bg-black/40 p-3 text-xs">
                    <code>{finding.expression}</code>
                  </pre>
                </dd>
              </div>
            )}
            <div className="min-w-0">
              <dt className="opacity-70">Raw evidence</dt>
              <dd className="mt-1">
                <pre className="overflow-x-auto rounded-md bg-black/60 p-3 text-xs">
                  <code>{finding.evidence}</code>
                </pre>
              </dd>
            </div>
          </dl>
        </details>
      </div>

      {finding.tier === "critical" && (
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

export function ScanResult({ state }: { state: ScanResultState }) {
  const [liveEvidence, setLiveEvidence] = useState<LiveVerificationEvidence | null>(null);

  if (state.status === "error") {
    return (
      <div
        role="alert"
        className="rounded-lg border border-amber-500/50 bg-amber-950/30 p-5 text-amber-100"
      >
        <p className="text-sm font-semibold uppercase tracking-wide text-amber-300">
          Scan failed
        </p>
        <p className="mt-2 text-sm leading-relaxed">{state.error.message}</p>
      </div>
    );
  }

  const { findings, coverage, repository, repositoryUrl, isDemoRepository, scanToken } = state;

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
          <p className="text-sm font-semibold uppercase tracking-wide text-zinc-400">
            No migrations found
          </p>
          <p className="mt-2 text-sm leading-relaxed">
            No files under <code className="font-mono">supabase/migrations/</code> or a{" "}
            <code className="font-mono">supabase/schema.sql</code> were found in{" "}
            <span className="font-mono">{repository}</span>. This scanner only supports
            repositories that store their Supabase policy SQL in those locations.
          </p>
        </div>
      </div>
    );
  }

  if (findings.length === 0) {
    return (
      <div className="flex flex-col gap-4">
        <SecuritySummaryCard state={state} liveEvidence={liveEvidence} />
        <div className="rounded-lg border border-emerald-600/50 bg-emerald-950/30 p-5 text-emerald-100">
          <p className="text-sm font-semibold uppercase tracking-wide text-emerald-300">
            No issues flagged
          </p>
          <p className="mt-2 text-sm leading-relaxed">
            Inspected {coverage.policiesInspected} polic{coverage.policiesInspected === 1 ? "y" : "ies"} in{" "}
            <span className="font-mono">{repository}</span> against known access-control failure patterns and
            found nothing to flag. This does not prove the deployment is secure — it means no known failure
            pattern was detected in the SQL that was reachable to this scanner.
          </p>
        </div>
        <details className="text-xs text-zinc-500">
          <summary className="cursor-pointer select-none">Technical details</summary>
          <div className="mt-3">
            <PipelineFacts state={state} />
          </div>
        </details>
        {liveSection("no_finding")}
      </div>
    );
  }

  const orderedFindings = [...findings].sort((a, b) => {
    const priority: Record<AuditFindingTier, number> = { critical: 0, high: 1, review: 2 };
    return priority[a.tier] - priority[b.tier];
  });
  const criticalFindings = findings.filter((f) => f.tier === "critical");

  return (
    <div className="flex flex-col gap-4">
      <SecuritySummaryCard state={state} liveEvidence={liveEvidence} />

      <details className="text-xs text-zinc-500">
        <summary className="cursor-pointer select-none">Technical details</summary>
        <div className="mt-3">
          <PipelineFacts state={state} />
        </div>
      </details>

      {orderedFindings.map((finding) => (
        <FindingCard key={finding.id} finding={finding} isDemoRepository={isDemoRepository} />
      ))}

      {criticalFindings.length > 0 && liveSection("finding_present")}
    </div>
  );
}
