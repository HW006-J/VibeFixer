"use client";

import { useState } from "react";
import type { LiveValidationApiResponse } from "@/lib/scanner/api-types";
import { RepairFlowPanel } from "./repair-flow-panel";

type LiveValidationState =
  | { status: "idle" }
  | { status: "running" }
  | { status: "success"; data: Extract<LiveValidationApiResponse, { ok: true }> }
  | { status: "error"; message: string };

/**
 * Runs a real authenticated query against the isolated demonstration
 * Supabase project — only ever rendered for the configured demo repository.
 * Every value shown comes directly from the live API response; nothing is
 * pre-computed or simulated client-side.
 */
export function LiveValidationPanel({ repositoryUrl }: { repositoryUrl: string }) {
  const [state, setState] = useState<LiveValidationState>({ status: "idle" });

  async function runValidation() {
    setState({ status: "running" });
    try {
      const response = await fetch("/api/live-validate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ repositoryUrl }),
      });
      const data = (await response.json()) as LiveValidationApiResponse;
      if (!data.ok) {
        setState({ status: "error", message: data.error.message });
      } else {
        setState({ status: "success", data });
      }
    } catch {
      setState({ status: "error", message: "Could not reach the live validation service." });
    }
  }

  return (
    <div className="rounded-lg border border-purple-500/40 bg-purple-950/20 p-5">
      <p className="text-sm font-semibold uppercase tracking-wide text-purple-300">
        Live database validation
      </p>
      <p className="mt-1 text-sm leading-relaxed text-purple-100/80">
        Runs a real authenticated query against the isolated demonstration Supabase project to
        prove this policy is exploitable on the deployed database, not just in source.
      </p>

      {state.status !== "success" && (
        <button
          type="button"
          onClick={runValidation}
          disabled={state.status === "running"}
          aria-busy={state.status === "running"}
          className="mt-3 inline-flex h-10 items-center justify-center rounded-md bg-purple-600 px-5 text-sm font-semibold text-white transition-colors hover:bg-purple-500 focus:outline-none focus-visible:ring-2 focus-visible:ring-purple-400 focus-visible:ring-offset-2 focus-visible:ring-offset-black disabled:cursor-not-allowed disabled:opacity-60"
        >
          {state.status === "running" ? "Validating…" : "Run live validation"}
        </button>
      )}

      {state.status === "error" && (
        <p role="alert" className="mt-3 text-sm leading-relaxed text-amber-300">
          {state.message}
        </p>
      )}

      {state.status === "success" && (
        <div className="mt-3 flex flex-col gap-3">
          <p className="text-sm leading-relaxed text-purple-100">
            Signed in as <span className="font-mono">{state.data.attackerEmail}</span> and queried{" "}
            <span className="font-mono">{state.data.table}</span>: {state.data.totalRowsReturned} row
            {state.data.totalRowsReturned === 1 ? "" : "s"} returned ({state.data.ownRowCount} own,{" "}
            {state.data.leakedRowCount} belonging to another trainer).
          </p>

          {state.data.leakedRowCount > 0 ? (
            <div>
              <p className="text-sm font-semibold text-red-300">
                Live-confirmed: another trainer&apos;s rows were returned
              </p>
              <ul className="mt-2 flex flex-col gap-2">
                {state.data.leakedRows.map((row) => (
                  <li key={row.id} className="rounded-md bg-black/40 p-3 text-xs text-purple-100">
                    <div className="font-mono">
                      {row.name} — {row.email ?? "no email"}
                    </div>
                    {row.privateNotes && <div className="mt-1 text-red-200">{row.privateNotes}</div>}
                  </li>
                ))}
              </ul>
            </div>
          ) : (
            <p className="text-sm text-emerald-300">
              No other trainer&apos;s rows were returned in this run.
            </p>
          )}

          {state.data.leakedRowCount > 0 && <RepairFlowPanel repositoryUrl={repositoryUrl} />}
        </div>
      )}
    </div>
  );
}
