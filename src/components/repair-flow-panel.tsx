"use client";

import { useEffect, useState } from "react";
import type { LiveValidationApiResponse } from "@/lib/scanner/api-types";
import type {
  RepairApplyApiResponse,
  RepairPreflightApiResponse,
  RepairProposeApiResponse,
  RepairProposeSuccessResponse,
  RepairResetApiResponse,
} from "@/lib/repair/api-types";

type ProposeState =
  | { step: "idle" }
  | { step: "loading" }
  | { step: "done"; data: RepairProposeSuccessResponse }
  | { step: "error"; message: string };

type ApplyState =
  | { step: "idle" }
  | { step: "loading" }
  | { step: "done"; appliedExpression: string }
  | { step: "error"; message: string };

type ReverifyState =
  | { step: "idle" }
  | { step: "loading" }
  | { step: "done"; totalRowsReturned: number; leakedRowCount: number }
  | { step: "error"; message: string };

type ResetState =
  | { step: "idle" }
  | { step: "loading" }
  | { step: "done"; restoredExpression: string }
  | { step: "error"; message: string };

type PreflightState =
  | { step: "idle" }
  | { step: "ready" }
  | { step: "not-ready"; message: string }
  | { step: "error"; message: string };

const buttonClasses =
  "inline-flex h-10 items-center justify-center rounded-md px-5 text-sm font-semibold text-white transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-black disabled:cursor-not-allowed disabled:opacity-60";

async function postJson<T>(url: string, repositoryUrl: string): Promise<T> {
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ repositoryUrl }),
  });
  return (await response.json()) as T;
}

/**
 * The repair sub-flow: AI proposes a fix grounded in a fresh live-query
 * rerun -> backend validates the proposal against a strict allowlist ->
 * a human clicks Apply -> trusted, fixed SQL is applied -> the identical
 * live query reruns to prove the leak is closed -> an explicit reset
 * restores the vulnerable state for the next demo run. Every number and
 * every piece of AI text shown here comes from a real API response; never
 * pre-computed or assumed client-side.
 */
export function RepairFlowPanel({ repositoryUrl }: { repositoryUrl: string }) {
  const [propose, setPropose] = useState<ProposeState>({ step: "idle" });
  const [apply, setApply] = useState<ApplyState>({ step: "idle" });
  const [reverify, setReverify] = useState<ReverifyState>({ step: "idle" });
  const [reset, setReset] = useState<ResetState>({ step: "idle" });
  const [preflight, setPreflight] = useState<PreflightState>({ step: "idle" });

  const canApply = propose.step === "done" && propose.data.valid;

  // Before ever offering "Approve and apply", verify the local Supabase CLI
  // mutation channel is actually ready (binary resolvable, project linked
  // and matching, authenticated, live round trip succeeds) — so a broken
  // local setup surfaces as a specific setup error instead of only being
  // discovered after a human clicks Apply.
  useEffect(() => {
    if (!canApply || preflight.step !== "idle") return;
    let cancelled = false;
    fetch("/api/repair/preflight")
      .then((response) => response.json() as Promise<RepairPreflightApiResponse>)
      .then((data) => {
        if (cancelled) return;
        if (!data.ok) {
          setPreflight({ step: "error", message: data.error.message });
        } else if (data.ready) {
          setPreflight({ step: "ready" });
        } else {
          setPreflight({
            step: "not-ready",
            message: data.message ?? "The local database mutation channel is not ready.",
          });
        }
      })
      .catch(() => {
        if (!cancelled) {
          setPreflight({ step: "error", message: "Could not reach the readiness check service." });
        }
      });
    return () => {
      cancelled = true;
    };
  }, [canApply, preflight.step]);

  async function runPropose() {
    setPropose({ step: "loading" });
    try {
      const data = await postJson<RepairProposeApiResponse>("/api/repair/propose", repositoryUrl);
      if (!data.ok) {
        setPropose({ step: "error", message: data.error.message });
      } else {
        setPropose({ step: "done", data });
      }
    } catch {
      setPropose({ step: "error", message: "Could not reach the repair proposal service." });
    }
  }

  async function runApply() {
    setApply({ step: "loading" });
    try {
      const data = await postJson<RepairApplyApiResponse>("/api/repair/apply", repositoryUrl);
      if (!data.ok) {
        setApply({ step: "error", message: data.error.message });
      } else {
        setApply({ step: "done", appliedExpression: data.appliedExpression });
      }
    } catch {
      setApply({ step: "error", message: "Could not reach the repair apply service." });
    }
  }

  async function runReverify() {
    setReverify({ step: "loading" });
    try {
      const data = await postJson<LiveValidationApiResponse>("/api/live-validate", repositoryUrl);
      if (!data.ok) {
        setReverify({ step: "error", message: data.error.message });
      } else {
        setReverify({ step: "done", totalRowsReturned: data.totalRowsReturned, leakedRowCount: data.leakedRowCount });
      }
    } catch {
      setReverify({ step: "error", message: "Could not reach the live validation service." });
    }
  }

  async function runReset() {
    setReset({ step: "loading" });
    try {
      const data = await postJson<RepairResetApiResponse>("/api/repair/reset", repositoryUrl);
      if (!data.ok) {
        setReset({ step: "error", message: data.error.message });
      } else {
        setReset({ step: "done", restoredExpression: data.restoredExpression });
        // A reset invalidates any earlier apply/reverify result shown above.
        setApply({ step: "idle" });
        setReverify({ step: "idle" });
        setPropose({ step: "idle" });
        setPreflight({ step: "idle" });
      }
    } catch {
      setReset({ step: "error", message: "Could not reach the repair reset service." });
    }
  }

  return (
    <div className="rounded-lg border border-sky-500/40 bg-sky-950/20 p-5">
      <p className="text-sm font-semibold uppercase tracking-wide text-sky-300">
        AI-assisted repair
      </p>
      <p className="mt-1 text-sm leading-relaxed text-sky-100/80">
        Asks Gemini to propose a fix grounded in the real rows returned above, then only ever
        applies our own fixed, pre-approved SQL — never the model&apos;s raw output — and only
        after a human approves.
      </p>

      {propose.step !== "done" && (
        <button
          type="button"
          onClick={runPropose}
          disabled={propose.step === "loading"}
          aria-busy={propose.step === "loading"}
          className={`mt-3 bg-sky-600 hover:bg-sky-500 focus-visible:ring-sky-400 ${buttonClasses}`}
        >
          {propose.step === "loading" ? "Analysing…" : "Get AI repair proposal"}
        </button>
      )}

      {propose.step === "error" && (
        <p role="alert" className="mt-3 text-sm leading-relaxed text-amber-300">
          {propose.message}
        </p>
      )}

      {propose.step === "done" && (
        <div className="mt-3 flex flex-col gap-3 text-sm text-sky-100">
          {propose.data.alreadyRepaired ? (
            <p>
              The live policy on <span className="font-mono">{propose.data.table}</span> already
              matches the trusted repair expression — nothing to propose.
            </p>
          ) : propose.data.aiPerformed ? (
            <div>
              <p className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-sky-300/70">
                <span>
                  Provider: <span className="font-mono text-sky-200">{propose.data.provider}</span>
                </span>
                <span>
                  Model: <span className="font-mono text-sky-200">{propose.data.model}</span>
                </span>
                <span>
                  Duration: <span className="font-mono text-sky-200">{propose.data.durationMs}ms</span>
                </span>
                <span>
                  Confidence: <span className="font-mono text-sky-200">{propose.data.confidence}</span>
                </span>
              </p>
              <p className="mt-2">
                Analysed {propose.data.leakedRowCount} real leaked row(s) just re-confirmed live
                and proposed:
              </p>
              <pre className="mt-1 overflow-x-auto rounded-md bg-black/40 p-3 text-xs text-sky-100">
                <code>{propose.data.proposedExpression}</code>
              </pre>
              <p className="mt-2">{propose.data.explanation}</p>
              {propose.data.assumptions && (
                <p className="mt-2 text-xs text-sky-300/70">
                  Stated assumption: {propose.data.assumptions}
                </p>
              )}
              <p
                className={`mt-2 text-xs font-semibold uppercase tracking-wide ${
                  propose.data.valid ? "text-emerald-300" : "text-amber-300"
                }`}
              >
                {propose.data.valid
                  ? "Validated by the backend — matches the one trusted repair for this table."
                  : "Not validated — this proposal does not match a trusted repair pattern and cannot be applied."}
              </p>
            </div>
          ) : (
            <p className="text-amber-300">
              Gemini did not return a proposal (no GEMINI_API_KEY configured on the server, or the
              call failed). No AI analysis occurred, and no repair can be applied automatically.
            </p>
          )}

          {canApply && apply.step !== "done" && (
            <div>
              <p className="text-xs text-sky-300/70">Exact SQL that will run on approval</p>
              <pre className="mt-1 overflow-x-auto rounded-md bg-black/40 p-3 text-xs text-sky-100">
                <code>USING ({propose.data.trustedExpression})</code>
              </pre>

              {preflight.step === "idle" && (
                <p className="mt-2 text-xs text-sky-300/70">
                  Checking whether the local database mutation channel is ready…
                </p>
              )}

              {preflight.step === "ready" && (
                <button
                  type="button"
                  onClick={runApply}
                  disabled={apply.step === "loading"}
                  aria-busy={apply.step === "loading"}
                  className={`mt-3 bg-emerald-600 hover:bg-emerald-500 focus-visible:ring-emerald-400 ${buttonClasses}`}
                >
                  {apply.step === "loading" ? "Applying…" : "Approve and apply this fix"}
                </button>
              )}

              {(preflight.step === "not-ready" || preflight.step === "error") && (
                <p role="alert" className="mt-2 text-sm leading-relaxed text-amber-300">
                  Cannot apply — the local database mutation channel is not ready: {preflight.message}
                </p>
              )}
            </div>
          )}
        </div>
      )}

      {apply.step === "error" && (
        <p role="alert" className="mt-3 text-sm leading-relaxed text-amber-300">
          The AI proposal above succeeded and was validated, but applying it to the database
          failed: {apply.message}
        </p>
      )}

      {apply.step === "done" && (
        <div className="mt-3 flex flex-col gap-3 text-sm text-sky-100">
          <p className="text-emerald-300">
            Applied: <span className="font-mono">USING ({apply.appliedExpression})</span>
          </p>

          {reverify.step !== "done" && (
            <button
              type="button"
              onClick={runReverify}
              disabled={reverify.step === "loading"}
              aria-busy={reverify.step === "loading"}
              className={`w-fit bg-sky-600 hover:bg-sky-500 focus-visible:ring-sky-400 ${buttonClasses}`}
            >
              {reverify.step === "loading" ? "Re-running…" : "Re-run the identical live query"}
            </button>
          )}

          {reverify.step === "error" && (
            <p role="alert" className="text-amber-300">
              {reverify.message}
            </p>
          )}

          {reverify.step === "done" &&
            (reverify.leakedRowCount === 0 ? (
              <p className="text-emerald-300">
                Fixed: the identical query now returns {reverify.totalRowsReturned} row(s), 0
                belonging to another trainer.
              </p>
            ) : (
              <p role="alert" className="text-red-300">
                Still leaking: the identical query still returned {reverify.leakedRowCount} row(s)
                belonging to another trainer.
              </p>
            ))}
        </div>
      )}

      {(apply.step === "done" || reset.step !== "idle") && (
        <div className="mt-4 border-t border-sky-800 pt-3">
          {reset.step !== "done" && (
            <button
              type="button"
              onClick={runReset}
              disabled={reset.step === "loading"}
              aria-busy={reset.step === "loading"}
              className={`bg-zinc-700 hover:bg-zinc-600 focus-visible:ring-zinc-400 ${buttonClasses}`}
            >
              {reset.step === "loading" ? "Resetting…" : "Reset demo to vulnerable state"}
            </button>
          )}
          {reset.step === "error" && (
            <p role="alert" className="mt-2 text-sm text-amber-300">
              {reset.message}
            </p>
          )}
          {reset.step === "done" && (
            <p className="text-sm text-zinc-300">
              Restored: <span className="font-mono">USING ({reset.restoredExpression})</span>. Run
              the scan and live validation again to reproduce the leak.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
