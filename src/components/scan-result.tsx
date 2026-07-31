import type { RlsFinding } from "@/lib/scanner/types";
import type { ScanErrorResponse } from "@/lib/scanner/api-types";

type SuccessState = {
  status: "success";
  repository: string;
  filesScanned: string[];
  findings: RlsFinding[];
};

type ErrorState = {
  status: "error";
  error: ScanErrorResponse["error"];
};

export type ScanResultState = SuccessState | ErrorState;

function FindingCard({ finding }: { finding: RlsFinding }) {
  return (
    <div
      role="alert"
      className="rounded-lg border border-red-500/60 bg-red-950/40 p-5 shadow-[0_0_0_1px_rgba(239,68,68,0.15)]"
    >
      <div className="flex flex-wrap items-center gap-2">
        <span className="inline-flex items-center rounded-full bg-red-600 px-2.5 py-0.5 text-xs font-semibold uppercase tracking-wide text-white">
          {finding.severity}
        </span>
        <span className="inline-flex items-center rounded-full border border-red-400/50 px-2.5 py-0.5 text-xs font-mono text-red-200">
          {finding.ruleId}
        </span>
      </div>

      <h3 className="mt-3 text-lg font-semibold text-red-50">{finding.title}</h3>

      <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 text-sm sm:grid-cols-3">
        <div>
          <dt className="text-red-300/70">File</dt>
          <dd className="font-mono text-red-100">{finding.filePath}</dd>
        </div>
        <div>
          <dt className="text-red-300/70">Line</dt>
          <dd className="font-mono text-red-100">{finding.line}</dd>
        </div>
        <div>
          <dt className="text-red-300/70">Table</dt>
          <dd className="font-mono text-red-100">{finding.table ?? "unknown"}</dd>
        </div>
        <div>
          <dt className="text-red-300/70">Operation</dt>
          <dd className="font-mono text-red-100">{finding.operation ?? "unknown"}</dd>
        </div>
        <div>
          <dt className="text-red-300/70">Role</dt>
          <dd className="font-mono text-red-100">{finding.role ?? "unknown"}</dd>
        </div>
      </dl>

      <div className="mt-4">
        <p className="text-red-300/70 text-sm">Evidence</p>
        <pre className="mt-1 overflow-x-auto rounded-md bg-black/60 p-3 text-xs text-red-100">
          <code>{finding.evidence}</code>
        </pre>
      </div>

      <p className="mt-4 text-sm leading-relaxed text-red-100/90">{finding.explanation}</p>
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

  const { findings, filesScanned, repository } = state;

  if (filesScanned.length === 0) {
    return (
      <div className="rounded-lg border border-zinc-700 bg-zinc-900/60 p-5 text-zinc-200">
        <p className="text-sm font-semibold uppercase tracking-wide text-zinc-400">
          No migrations found
        </p>
        <p className="mt-2 text-sm leading-relaxed">
          No files under <code className="font-mono">supabase/migrations/</code> or a{" "}
          <code className="font-mono">supabase/schema.sql</code> were found in{" "}
          <span className="font-mono">{repository}</span>.
        </p>
      </div>
    );
  }

  if (findings.length === 0) {
    return (
      <div className="rounded-lg border border-emerald-600/50 bg-emerald-950/30 p-5 text-emerald-100">
        <p className="text-sm font-semibold uppercase tracking-wide text-emerald-300">
          No allow-all policies detected
        </p>
        <p className="mt-2 text-sm leading-relaxed">
          Scanned {filesScanned.length} file{filesScanned.length === 1 ? "" : "s"} in{" "}
          <span className="font-mono">{repository}</span> and found no{" "}
          <code className="font-mono">USING (true)</code> policies.
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {findings.map((finding) => (
        <FindingCard key={finding.id} finding={finding} />
      ))}
    </div>
  );
}
