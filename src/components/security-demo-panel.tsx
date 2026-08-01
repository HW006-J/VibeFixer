"use client";

import { useEffect, useState } from "react";
import type {
  LiveStateApiResponse,
  RepairApplyApiResponse,
  RepairProposeApiResponse,
  RepairResetApiResponse,
} from "@/lib/repair/api-types";
import type { LiveValidationApiResponse } from "@/lib/scanner/api-types";

export type SourceState = "finding_present" | "no_finding" | "scan_unavailable";

type Counts = { totalRowsReturned: number; ownRowCount: number; leakedRowCount: number };

type EvidenceDetail = Counts & {
  attackerEmail: string;
  leakedRows: Array<{ id: string; name: string; email: string | null; privateNotes: string | null }>;
};

type ProposalDetail = {
  provider: string;
  model: string;
  durationMs: number;
  explanation: string;
  proposedExpression: string;
  confidence: "high" | "medium" | "low";
  assumptions: string;
  valid: boolean;
  trustedExpression: string;
};

type ActionKind =
  | "idle"
  | "validating"
  | "requesting_ai_proposal"
  | "proposal_ready"
  | "applying"
  | "repair_verified"
  | "resetting"
  | "error";

/**
 * Every piece of session data (proposal, evidence, verification result) is
 * scoped to `key` (repositoryUrl::refreshToken). When `key` no longer
 * matches the current key, the record is treated as absent rather than
 * shown — this is what guarantees a rescan or a fresh mount can never
 * display state left over from a previous check, without needing any
 * imperative "clear" call in the fetch effect itself.
 */
type SessionState = {
  key: string;
  action: ActionKind;
  errorMessage: string | null;
  evidence: EvidenceDetail | null;
  proposal: ProposalDetail | null;
  verifiedBefore: Counts | null;
  verifiedAfter: Counts | null;
};

function idleSession(key: string): SessionState {
  return {
    key,
    action: "idle",
    errorMessage: null,
    evidence: null,
    proposal: null,
    verifiedBefore: null,
    verifiedAfter: null,
  };
}

type LiveRecord =
  | { key: string; step: "loaded"; data: Extract<LiveStateApiResponse, { ok: true }> }
  | { key: string; step: "error"; message: string };

const QUERY_FINGERPRINT = "GET /rest/v1/clients?select=id,trainer_id,name,email,private_notes";

const primaryButtonClasses =
  "inline-flex h-10 items-center justify-center rounded-md px-5 text-sm font-semibold text-white transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-black disabled:cursor-not-allowed disabled:opacity-60";

function oneSentence(text: string): string {
  const match = /^[^.!?]*[.!?]/.exec(text.trim());
  return match ? match[0] : text;
}

async function postJson<T>(url: string, repositoryUrl: string): Promise<T> {
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ repositoryUrl }),
  });
  return (await response.json()) as T;
}

function evidenceFromLiveState(data: Extract<LiveStateApiResponse, { ok: true }>): Counts | null {
  if (data.status === "vulnerable" || data.status === "protected") {
    return { totalRowsReturned: data.totalRowsReturned, ownRowCount: data.ownRowCount, leakedRowCount: data.leakedRowCount };
  }
  return null;
}

function Spinner({ label }: { label: string }) {
  return (
    <div className="flex items-center gap-2 text-sm text-zinc-300" aria-busy="true">
      <span
        aria-hidden="true"
        className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-zinc-600 border-t-purple-500"
      />
      {label}
    </div>
  );
}

/**
 * A single server-derived state machine driving the entire live demo
 * workflow. Nothing about whether the database is currently vulnerable or
 * protected is ever inferred from a prior client action — the live status
 * (`liveRecord`) is always re-fetched from /api/repair/live-state, both on
 * mount/rescan and immediately after apply or reset succeed. `session`
 * (the in-flight proposal/evidence/verification data) exists purely to
 * enrich that server-confirmed status with real evidence gathered in this
 * browser session; it can never override or contradict `liveRecord`, and
 * it is fully discarded — not merely reset to "idle" — on every reset and
 * on every rescan/refresh (via the key-scoping above).
 */
export function SecurityDemoPanel({
  repositoryUrl,
  refreshToken,
  sourceState,
  onLiveEvidence,
}: {
  repositoryUrl: string;
  refreshToken: number;
  sourceState: SourceState;
  /** Called with real row-count evidence whenever it changes (initial check, after validating, after apply, after reset), or null when no evidence is currently available. Purely informational for an ancestor's executive summary — never used to decide anything within this component itself. */
  onLiveEvidence?: (evidence: Counts | null) => void;
}) {
  const currentKey = `${repositoryUrl}::${refreshToken}`;
  const [liveRecord, setLiveRecord] = useState<LiveRecord | null>(null);
  const [session, setSession] = useState<SessionState | null>(null);

  useEffect(() => {
    let cancelled = false;
    postJson<LiveStateApiResponse>("/api/repair/live-state", repositoryUrl)
      .then((data) => {
        if (cancelled) return;
        if (!data.ok) {
          setLiveRecord({ key: currentKey, step: "error", message: data.error.message });
          onLiveEvidence?.(null);
        } else {
          setLiveRecord({ key: currentKey, step: "loaded", data });
          onLiveEvidence?.(evidenceFromLiveState(data));
        }
      })
      .catch(() => {
        if (!cancelled) {
          setLiveRecord({ key: currentKey, step: "error", message: "Could not reach the live state service." });
          onLiveEvidence?.(null);
        }
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- currentKey is derived from these two deps; onLiveEvidence is a stable-enough callback
  }, [repositoryUrl, refreshToken]);

  const activeSession = session && session.key === currentKey ? session : idleSession(currentKey);
  function patchSession(patch: Partial<SessionState>) {
    setSession({ ...activeSession, ...patch, key: currentKey });
  }

  async function runValidate() {
    patchSession({ action: "validating", errorMessage: null });
    try {
      const data = await postJson<LiveValidationApiResponse>("/api/live-validate", repositoryUrl);
      if (!data.ok) {
        patchSession({ action: "error", errorMessage: data.error.message });
        return;
      }
      patchSession({
        action: "idle",
        evidence: {
          totalRowsReturned: data.totalRowsReturned,
          ownRowCount: data.ownRowCount,
          leakedRowCount: data.leakedRowCount,
          attackerEmail: data.attackerEmail,
          leakedRows: data.leakedRows.map((row) => ({
            id: row.id,
            name: row.name,
            email: row.email,
            privateNotes: row.privateNotes,
          })),
        },
      });
      onLiveEvidence?.({
        totalRowsReturned: data.totalRowsReturned,
        ownRowCount: data.ownRowCount,
        leakedRowCount: data.leakedRowCount,
      });
    } catch {
      patchSession({ action: "error", errorMessage: "Could not reach the live validation service." });
    }
  }

  async function runPropose() {
    patchSession({ action: "requesting_ai_proposal", errorMessage: null });
    try {
      const data = await postJson<RepairProposeApiResponse>("/api/repair/propose", repositoryUrl);
      if (!data.ok) {
        patchSession({ action: "error", errorMessage: data.error.message });
        return;
      }
      if (data.alreadyRepaired || !data.aiPerformed || data.proposedExpression === null) {
        patchSession({
          action: "error",
          errorMessage: data.alreadyRepaired
            ? "The live policy already matches the trusted repair — nothing to propose."
            : "Gemini did not return a usable proposal (no API key configured on the server, or the call failed).",
        });
        return;
      }
      patchSession({
        action: "proposal_ready",
        proposal: {
          provider: data.provider ?? "Google Gemini",
          model: data.model ?? "unknown",
          durationMs: data.durationMs ?? 0,
          explanation: data.explanation ?? "",
          proposedExpression: data.proposedExpression,
          confidence: data.confidence ?? "low",
          assumptions: data.assumptions ?? "",
          valid: data.valid,
          trustedExpression: data.trustedExpression,
        },
      });
    } catch {
      patchSession({ action: "error", errorMessage: "Could not reach the repair proposal service." });
    }
  }

  async function runApply() {
    patchSession({ action: "applying", errorMessage: null });
    try {
      const applyData = await postJson<RepairApplyApiResponse>("/api/repair/apply", repositoryUrl);
      if (!applyData.ok) {
        patchSession({ action: "error", errorMessage: applyData.error.message });
        return;
      }

      const before: Counts | null = activeSession.evidence
        ? {
            totalRowsReturned: activeSession.evidence.totalRowsReturned,
            ownRowCount: activeSession.evidence.ownRowCount,
            leakedRowCount: activeSession.evidence.leakedRowCount,
          }
        : null;

      const revalidate = await postJson<LiveValidationApiResponse>("/api/live-validate", repositoryUrl);
      if (!revalidate.ok) {
        patchSession({ action: "error", errorMessage: revalidate.error.message });
        return;
      }
      const after: Counts = {
        totalRowsReturned: revalidate.totalRowsReturned,
        ownRowCount: revalidate.ownRowCount,
        leakedRowCount: revalidate.leakedRowCount,
      };

      // Re-derive live status from the server rather than assuming the
      // apply worked — the same check a refresh would perform.
      const liveData = await postJson<LiveStateApiResponse>("/api/repair/live-state", repositoryUrl);
      if (!liveData.ok) {
        patchSession({ action: "error", errorMessage: liveData.error.message });
        return;
      }
      setLiveRecord({ key: currentKey, step: "loaded", data: liveData });
      patchSession({ action: "repair_verified", verifiedBefore: before, verifiedAfter: after });
      onLiveEvidence?.(after);
    } catch {
      patchSession({ action: "error", errorMessage: "Could not reach the repair apply service." });
    }
  }

  async function runReset() {
    patchSession({ action: "resetting", errorMessage: null });
    try {
      const resetData = await postJson<RepairResetApiResponse>("/api/repair/reset", repositoryUrl);
      if (!resetData.ok) {
        patchSession({ action: "error", errorMessage: resetData.error.message });
        return;
      }

      const liveData = await postJson<LiveStateApiResponse>("/api/repair/live-state", repositoryUrl);
      if (!liveData.ok) {
        patchSession({ action: "error", errorMessage: liveData.error.message });
        return;
      }
      setLiveRecord({ key: currentKey, step: "loaded", data: liveData });
      // Fully discard every piece of prior session state — proposal,
      // applied text, verification result — not merely set action back to
      // idle. A partial reset is exactly the bug this replaces.
      setSession(idleSession(currentKey));
      onLiveEvidence?.(evidenceFromLiveState(liveData));
    } catch {
      patchSession({ action: "error", errorMessage: "Could not reach the repair reset service." });
    }
  }

  const isLoadingLiveState = liveRecord === null || liveRecord.key !== currentKey;

  if (isLoadingLiveState) {
    return (
      <div className="flex items-center gap-3 rounded-lg border border-zinc-800 bg-zinc-900/60 p-4 text-sm text-zinc-300">
        <Spinner label="Checking live database state…" />
      </div>
    );
  }

  const liveStatus = liveRecord.step === "loaded" ? liveRecord.data.status : "error";
  const showDrift = sourceState === "finding_present" && liveStatus === "protected";

  return (
    <div className="flex flex-col gap-4">
      <SecurityStatusCard sourceState={sourceState} liveStatus={liveStatus} showDrift={showDrift} />

      {liveRecord.step === "error" && (
        <div role="alert" className="rounded-lg border border-amber-500/50 bg-amber-950/30 p-4 text-sm text-amber-100">
          {liveRecord.message}
        </div>
      )}

      {liveRecord.step === "loaded" && liveRecord.data.status === "unavailable" && (
        <div role="alert" className="rounded-lg border border-zinc-700 bg-zinc-900/60 p-4 text-sm text-zinc-300">
          <p className="text-xs font-semibold uppercase tracking-wide text-zinc-400">Live inspection unavailable</p>
          <p className="mt-2 leading-relaxed">{liveRecord.data.reason}</p>
        </div>
      )}

      {liveRecord.step === "loaded" && liveRecord.data.status === "unexpected" && (
        <div role="alert" className="rounded-lg border border-amber-500/50 bg-amber-950/30 p-4 text-sm text-amber-100">
          <p className="text-xs font-semibold uppercase tracking-wide text-amber-300">Unexpected live state</p>
          <p className="mt-2 leading-relaxed">{liveRecord.data.reason}</p>
        </div>
      )}

      {liveRecord.step === "loaded" && liveRecord.data.status === "vulnerable" && (
        <VulnerableCard session={activeSession} onValidate={runValidate} onPropose={runPropose} onApply={runApply} />
      )}

      {liveRecord.step === "loaded" && liveRecord.data.status === "protected" && (
        <ProtectedCard session={activeSession} liveData={liveRecord.data} onReset={runReset} />
      )}
    </div>
  );
}

function liveStatusLabel(status: string): string {
  switch (status) {
    case "vulnerable":
      return "Vulnerable — cross-tenant rows exposed";
    case "protected":
      return "Protected — 0 cross-tenant rows exposed";
    case "unexpected":
      return "Unexpected state";
    case "unavailable":
      return "Live inspection unavailable";
    // "error" means the /api/repair/live-state request itself failed
    // (network error, or the repository gate rejected it) — distinct from
    // a real, successful response reporting status "unavailable". Collapsing
    // both into the same "Live inspection unavailable" label hid which one
    // actually happened; the real reason is still shown in the alert below.
    case "error":
      return "Live check failed — see details below";
    default:
      return "Live inspection unavailable";
  }
}

function liveStatusClasses(status: string): string {
  switch (status) {
    case "vulnerable":
      return "text-red-300";
    case "protected":
      return "text-emerald-300";
    case "unexpected":
      return "text-amber-300";
    case "error":
      return "text-amber-300";
    default:
      return "text-zinc-400";
  }
}

function SecurityStatusCard({
  sourceState,
  liveStatus,
  showDrift,
}: {
  sourceState: SourceState;
  liveStatus: string;
  showDrift: boolean;
}) {
  const sourceLabel =
    sourceState === "finding_present"
      ? "Source migration vulnerable"
      : sourceState === "no_finding"
        ? "No implemented finding"
        : "Scan unavailable";

  return (
    <div className="rounded-lg border border-zinc-800 bg-zinc-900/60 p-4 text-sm">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-xs font-semibold uppercase tracking-wide text-zinc-400">Source repository</span>
        <span className={sourceState === "finding_present" ? "text-red-300" : "text-zinc-300"}>{sourceLabel}</span>
      </div>
      <div className="mt-2 flex flex-wrap items-center justify-between gap-2 border-t border-zinc-800 pt-2">
        <span className="text-xs font-semibold uppercase tracking-wide text-zinc-400">Live database</span>
        <span className={liveStatusClasses(liveStatus)}>{liveStatusLabel(liveStatus)}</span>
      </div>
      {showDrift && (
        <p className="mt-3 text-xs leading-relaxed text-amber-300">
          Configuration drift: the live database is protected, but the repository migration remains vulnerable.
        </p>
      )}
    </div>
  );
}

function VulnerableCard({
  session,
  onValidate,
  onPropose,
  onApply,
}: {
  session: SessionState;
  onValidate: () => void;
  onPropose: () => void;
  onApply: () => void;
}) {
  const { action, evidence, proposal, errorMessage } = session;

  return (
    <div className="rounded-lg border border-red-500/50 bg-red-950/30 p-5 text-red-100">
      <p className="text-xs font-semibold uppercase tracking-wide text-red-300">Live database vulnerable</p>

      {action === "error" && errorMessage && (
        <p role="alert" className="mt-2 text-sm text-amber-300">
          {errorMessage}
        </p>
      )}

      {evidence && (
        <div className="mt-3 text-sm leading-relaxed">
          <p>
            Signed in as <span className="font-mono">{evidence.attackerEmail}</span>: {evidence.totalRowsReturned}{" "}
            row{evidence.totalRowsReturned === 1 ? "" : "s"} returned ({evidence.ownRowCount} own,{" "}
            {evidence.leakedRowCount} foreign).
          </p>
          {evidence.leakedRowCount > 0 && (
            <p className="mt-1 text-sm font-semibold text-red-200">Cross-tenant exposure verified</p>
          )}
          {evidence.leakedRows.length > 0 && (
            <ul className="mt-2 flex flex-col gap-2">
              {evidence.leakedRows.map((row) => (
                <li key={row.id} className="rounded-md bg-black/40 p-3 text-xs text-red-100">
                  <div className="font-mono">
                    {row.name} — {row.email ?? "no email"}
                  </div>
                  {row.privateNotes && <div className="mt-1 text-red-200">{row.privateNotes}</div>}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {proposal && (
        <div className="mt-4 rounded-md bg-black/30 p-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-red-300">Gemini repair proposal</p>
          <pre className="mt-1 overflow-x-auto rounded-md bg-black/40 p-2 text-xs text-red-100">
            <code>{proposal.proposedExpression}</code>
          </pre>
          <p className="mt-2 text-xs text-red-200/80">
            Confidence: {proposal.confidence} — {oneSentence(proposal.explanation)}
          </p>
          {!proposal.valid && (
            <p className="mt-2 text-xs font-semibold text-amber-300">
              Not validated by the backend — this proposal cannot be applied.
            </p>
          )}

          <details className="mt-3 text-xs text-red-200/70">
            <summary className="cursor-pointer select-none">Technical details</summary>
            <div className="mt-2 flex flex-col gap-1">
              <p>Provider: {proposal.provider}</p>
              <p>Model: {proposal.model}</p>
              <p>Duration: {proposal.durationMs}ms</p>
              <p>Full explanation: {proposal.explanation}</p>
              <p>Stated assumption: {proposal.assumptions}</p>
              <p>Validated execution SQL: USING ({proposal.trustedExpression})</p>
              <p>Query fingerprint: {QUERY_FINGERPRINT}</p>
            </div>
          </details>
        </div>
      )}

      <div className="mt-4">{renderVulnerablePrimaryAction(session, onValidate, onPropose, onApply)}</div>
    </div>
  );
}

function renderVulnerablePrimaryAction(
  session: SessionState,
  onValidate: () => void,
  onPropose: () => void,
  onApply: () => void,
) {
  const { action, evidence, proposal } = session;

  if (action === "validating") return <Spinner label="Validating…" />;
  if (action === "requesting_ai_proposal") return <Spinner label="Asking Gemini…" />;
  if (action === "applying") return <Spinner label="Applying…" />;

  if (evidence === null) {
    return (
      <button type="button" onClick={onValidate} className={`bg-purple-600 hover:bg-purple-500 focus-visible:ring-purple-400 ${primaryButtonClasses}`}>
        Run live validation
      </button>
    );
  }

  if (proposal === null) {
    return (
      <button type="button" onClick={onPropose} className={`bg-sky-600 hover:bg-sky-500 focus-visible:ring-sky-400 ${primaryButtonClasses}`}>
        Ask Gemini to design repair
      </button>
    );
  }

  if (!proposal.valid) {
    return null;
  }

  return (
    <button type="button" onClick={onApply} className={`bg-emerald-600 hover:bg-emerald-500 focus-visible:ring-emerald-400 ${primaryButtonClasses}`}>
      Approve and apply repair
    </button>
  );
}

function ProtectedCard({
  session,
  liveData,
  onReset,
}: {
  session: SessionState;
  liveData: Extract<LiveStateApiResponse, { ok: true; status: "protected" }>;
  onReset: () => void;
}) {
  const verified = session.action === "repair_verified" && session.verifiedBefore !== null && session.verifiedAfter !== null;

  return (
    <div className="rounded-lg border border-emerald-600/50 bg-emerald-950/30 p-5 text-emerald-100">
      <p className="text-sm font-semibold uppercase tracking-wide text-emerald-300">
        {verified ? "Repair verified" : "Live database protected"}
      </p>

      {verified && session.verifiedBefore && session.verifiedAfter ? (
        <div className="mt-2 text-sm leading-relaxed">
          <p>
            Before: {session.verifiedBefore.totalRowsReturned} total / {session.verifiedBefore.leakedRowCount} foreign
          </p>
          <p>
            After: {session.verifiedAfter.totalRowsReturned} total / {session.verifiedAfter.leakedRowCount} foreign
          </p>
          <p className="mt-1 text-xs text-emerald-300/70">Same query confirmed before and after (see technical details).</p>
        </div>
      ) : (
        <p className="mt-2 text-sm leading-relaxed">
          {liveData.totalRowsReturned} row{liveData.totalRowsReturned === 1 ? "" : "s"} returned, 0 cross-tenant rows
          exposed.
        </p>
      )}

      <details className="mt-3 text-xs text-emerald-300/70">
        <summary className="cursor-pointer select-none">Technical details</summary>
        <div className="mt-2 flex flex-col gap-1">
          <p>Validated execution SQL: USING ({liveData.currentExpression})</p>
          <p>Query fingerprint: {QUERY_FINGERPRINT}</p>
        </div>
      </details>

      <div className="mt-4">
        {session.action === "resetting" ? (
          <Spinner label="Resetting…" />
        ) : (
          <button
            type="button"
            onClick={onReset}
            className={`bg-zinc-700 hover:bg-zinc-600 focus-visible:ring-zinc-400 ${primaryButtonClasses}`}
          >
            Reset vulnerable demo
          </button>
        )}
      </div>

      {session.action === "error" && session.errorMessage && (
        <p role="alert" className="mt-2 text-xs text-amber-300">
          {session.errorMessage}
        </p>
      )}
    </div>
  );
}
