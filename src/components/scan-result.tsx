import type { AuditCoverage, AuditFinding } from "@/lib/audit/types";
import type { ScanErrorResponse } from "@/lib/scanner/api-types";
import { LiveStatePanel } from "./live-state-panel";

type SuccessState = {
  status: "success";
  repository: string;
  repositoryUrl: string;
  isDemoRepository: boolean;
  findings: AuditFinding[];
  coverage: AuditCoverage;
  durationMs: number;
  /** Incremented on every scan submission (even of the same URL) — forces LiveStatePanel to re-derive live state from the server rather than showing a result from a previous scan. */
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

/**
 * A checklist of facts already confirmed by the real server response.
 * Each item fades in with a small staggered delay for a polished demo
 * feel, but every value shown was already known before the animation
 * started — nothing here represents a live or simulated backend stage.
 */
function PipelineFacts({ state }: { state: SuccessState }) {
  const { repository, coverage, durationMs } = state;

  const facts = [
    `Repository scanned: ${repository}`,
    `${coverage.filesScanned.length} SQL ${pluralise(coverage.filesScanned.length, "file", "files")} fetched from GitHub`,
    `${coverage.statementsInspected} SQL ${pluralise(coverage.statementsInspected, "statement", "statements")} inspected`,
    `${coverage.policiesInspected} RLS ${pluralise(coverage.policiesInspected, "policy", "policies")} discovered across ${coverage.tablesDiscovered} ${pluralise(coverage.tablesDiscovered, "table", "tables")}`,
    `${coverage.criticalFindingCount} critical ${pluralise(coverage.criticalFindingCount, "finding", "findings")}, ${coverage.needsReviewCount} flagged for manual or semantic review`,
    ...(coverage.aiReviewsPerformed > 0
      ? [`${coverage.aiReviewsPerformed} reviewed by a real Claude model call`]
      : []),
    `Completed in ${durationMs}ms`,
  ];

  return (
    <ul className="flex flex-col gap-1.5 rounded-lg border border-zinc-800 bg-zinc-900/60 p-4 text-sm text-zinc-300">
      {facts.map((fact, index) => (
        <li
          key={fact}
          className="flex items-center gap-2"
          style={{ animation: "fact-reveal 300ms ease-out both", animationDelay: `${index * 60}ms` }}
        >
          <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-emerald-500" aria-hidden="true" />
          {fact}
        </li>
      ))}
    </ul>
  );
}

function FindingMeta({ finding }: { finding: AuditFinding }) {
  return (
    <dl className="mt-3 flex flex-col gap-3 text-sm">
      <div className="min-w-0">
        <dt className="opacity-70">File</dt>
        <dd className="mt-0.5 break-all font-mono">{finding.filePath}</dd>
      </div>

      <div className="grid grid-cols-2 gap-x-4 gap-y-2 sm:grid-cols-4">
        <div className="min-w-0">
          <dt className="opacity-70">Line</dt>
          <dd className="font-mono">{finding.line}</dd>
        </div>
        <div className="min-w-0">
          <dt className="opacity-70">Table</dt>
          <dd className="break-words font-mono">{finding.table ?? "unknown"}</dd>
        </div>
        <div className="min-w-0">
          <dt className="opacity-70">Operation</dt>
          <dd className="break-words font-mono">{finding.operation ?? "unknown"}</dd>
        </div>
        <div className="min-w-0">
          <dt className="opacity-70">Role</dt>
          <dd className="break-words font-mono">{finding.role ?? "unknown"}</dd>
        </div>
      </div>
    </dl>
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

function CriticalFindingCard({ finding, isDemoRepository }: { finding: AuditFinding; isDemoRepository: boolean }) {
  return (
    <div className="flex flex-col gap-2">
      <div
        role="alert"
        className="rounded-lg border border-red-500/60 bg-red-950/40 p-5 text-red-100 shadow-[0_0_0_1px_rgba(239,68,68,0.15)]"
      >
        <div className="flex flex-wrap items-center gap-2">
          <span className="inline-flex items-center rounded-full bg-red-600 px-2.5 py-0.5 text-xs font-semibold uppercase tracking-wide text-white">
            critical
          </span>
          <span className="inline-flex items-center rounded-full border border-red-400/50 px-2.5 py-0.5 text-xs font-mono text-red-200">
            {finding.ruleId}
          </span>
        </div>

        <h3 className="mt-3 text-lg font-semibold text-red-50">{finding.title}</h3>

        <FindingMeta finding={finding} />

        <div className="mt-4">
          <p className="text-sm text-red-300/70">Evidence</p>
          <pre className="mt-1 overflow-x-auto rounded-md bg-black/60 p-3 text-xs text-red-100">
            <code>{finding.evidence}</code>
          </pre>
        </div>

        <p className="mt-4 text-sm leading-relaxed text-red-100/90">{finding.explanation}</p>
      </div>

      <span className="inline-flex w-fit items-center rounded-full border border-zinc-700 bg-zinc-900 px-2.5 py-0.5 text-xs text-zinc-400">
        {isDemoRepository
          ? "Static repository finding — run live validation below to confirm on the deployed database"
          : "Static repository finding — live deployment not tested"}
      </span>
    </div>
  );
}

function ReviewFindingCard({ finding }: { finding: AuditFinding }) {
  return (
    <div
      role="alert"
      className="rounded-lg border border-amber-500/50 bg-amber-950/20 p-5 text-amber-100"
    >
      <div className="flex flex-wrap items-center gap-2">
        <span className="inline-flex items-center rounded-full bg-amber-600 px-2.5 py-0.5 text-xs font-semibold uppercase tracking-wide text-white">
          needs review
        </span>
        <span className="inline-flex items-center rounded-full border border-amber-400/50 px-2.5 py-0.5 text-xs font-mono text-amber-200">
          {finding.ruleId}
        </span>
      </div>

      <h3 className="mt-3 text-lg font-semibold text-amber-50">{finding.title}</h3>

      <FindingMeta finding={finding} />

      {finding.expression && (
        <div className="mt-4">
          <p className="text-sm text-amber-300/70">{finding.clause} expression</p>
          <pre className="mt-1 overflow-x-auto rounded-md bg-black/40 p-3 text-xs text-amber-100">
            <code>{finding.expression}</code>
          </pre>
        </div>
      )}

      <p className="mt-4 text-sm leading-relaxed text-amber-100/90">{finding.explanation}</p>

      {finding.aiReview ? (
        <div className={`mt-4 rounded-md border p-3 ${assessmentClasses(finding.aiReview.assessment)}`}>
          <p className="text-xs font-semibold uppercase tracking-wide">
            Claude semantic review ({finding.aiReview.model}) — {assessmentLabel(finding.aiReview.assessment)}
          </p>
          <p className="mt-1 text-sm leading-relaxed">{finding.aiReview.reasoning}</p>
          <p className="mt-2 text-xs opacity-70">
            An AI opinion, not a guarantee. It does not replace manual review.
          </p>
        </div>
      ) : (
        <p className="mt-4 text-xs text-amber-300/60">
          Not reviewed by AI (no model configured, or the per-scan review limit was reached). Requires
          manual review.
        </p>
      )}
    </div>
  );
}

export function ScanResult({ state }: { state: ScanResultState }) {
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

  if (coverage.filesScanned.length === 0) {
    return (
      <div className="flex flex-col gap-4">
        <PipelineFacts state={state} />
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
        <PipelineFacts state={state} />
        <div className="rounded-lg border border-emerald-600/50 bg-emerald-950/30 p-5 text-emerald-100">
          <p className="text-sm font-semibold uppercase tracking-wide text-emerald-300">
            No issues flagged
          </p>
          <p className="mt-2 text-sm leading-relaxed">
            Inspected {coverage.policiesInspected} polic{coverage.policiesInspected === 1 ? "y" : "ies"} in{" "}
            <span className="font-mono">{repository}</span> against known allow-all patterns and found
            nothing to flag. This does not prove the deployment is secure — it means no known
            failure pattern was detected in the SQL that was reachable to this scanner.
          </p>
        </div>
      </div>
    );
  }

  const criticalFindings = findings.filter((f) => f.tier === "critical");
  const reviewFindings = findings.filter((f) => f.tier === "review");

  return (
    <div className="flex flex-col gap-4">
      <PipelineFacts state={state} />

      {criticalFindings.map((finding) => (
        <CriticalFindingCard key={finding.id} finding={finding} isDemoRepository={isDemoRepository} />
      ))}

      {reviewFindings.map((finding) => (
        <ReviewFindingCard key={finding.id} finding={finding} />
      ))}

      {criticalFindings.length > 0 &&
        (isDemoRepository ? (
          <LiveStatePanel repositoryUrl={repositoryUrl} refreshToken={scanToken} />
        ) : (
          <div className="rounded-lg border border-zinc-700 bg-zinc-900/60 p-4 text-sm text-zinc-400">
            Live validation requires an authorised connected test environment.
          </div>
        ))}
    </div>
  );
}
