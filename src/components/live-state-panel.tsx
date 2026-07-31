"use client";

import { useEffect, useState } from "react";
import type { LiveStateApiResponse } from "@/lib/repair/api-types";
import { LiveValidationPanel } from "./live-validation-panel";

type LoadedRecord = { key: string; step: "loaded"; data: Extract<LiveStateApiResponse, { ok: true }> };
type ErrorRecord = { key: string; step: "error"; message: string };
type StateRecord = LoadedRecord | ErrorRecord;

type ResetRecord = { key: string; step: "loading" } | { key: string; step: "error"; message: string };

async function fetchLiveState(repositoryUrl: string): Promise<LiveStateApiResponse> {
  const response = await fetch("/api/repair/live-state", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ repositoryUrl }),
  });
  return (await response.json()) as LiveStateApiResponse;
}

/**
 * The single source of truth for whether repair or reset controls are
 * shown: always derived from a fresh server-side check of the real live
 * policy and a real Trainer A query — never from client-remembered
 * apply/reset outcomes. This is what makes the reset control survive a
 * browser refresh or a rescan: the check reruns from scratch every time
 * this component mounts or `refreshToken` changes, so there is no local
 * state that can go stale or get lost.
 *
 * Loading/error/reset records are keyed by `repositoryUrl::refreshToken`
 * and only ever compared against the current key (never reset
 * imperatively) — a stale record from a previous check cycle is simply
 * ignored rather than shown, without needing a synchronous setState call
 * inside the fetch effect itself.
 */
export function LiveStatePanel({ repositoryUrl, refreshToken }: { repositoryUrl: string; refreshToken: number }) {
  const currentKey = `${repositoryUrl}::${refreshToken}`;
  const [record, setRecord] = useState<StateRecord | null>(null);
  const [resetRecord, setResetRecord] = useState<ResetRecord | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetchLiveState(repositoryUrl)
      .then((data) => {
        if (cancelled) return;
        if (!data.ok) {
          setRecord({ key: currentKey, step: "error", message: data.error.message });
        } else {
          setRecord({ key: currentKey, step: "loaded", data });
        }
      })
      .catch(() => {
        if (!cancelled) {
          setRecord({ key: currentKey, step: "error", message: "Could not reach the live state service." });
        }
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- currentKey is derived from these two deps
  }, [repositoryUrl, refreshToken]);

  async function runReset() {
    setResetRecord({ key: currentKey, step: "loading" });
    try {
      const response = await fetch("/api/repair/reset", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ repositoryUrl }),
      });
      const data = await response.json();
      if (!data.ok) {
        setResetRecord({ key: currentKey, step: "error", message: data.error.message });
        return;
      }
      // Re-derive state from the server — the same check a refresh would
      // perform — rather than assuming the reset means "vulnerable".
      const recheck = await fetchLiveState(repositoryUrl);
      if (!recheck.ok) {
        setRecord({ key: currentKey, step: "error", message: recheck.error.message });
      } else {
        setRecord({ key: currentKey, step: "loaded", data: recheck });
      }
      setResetRecord(null);
    } catch {
      setResetRecord({ key: currentKey, step: "error", message: "Could not reach the repair reset service." });
    }
  }

  const isLoading = record === null || record.key !== currentKey;
  const activeReset: ResetRecord | { step: "idle" } =
    resetRecord && resetRecord.key === currentKey ? resetRecord : { step: "idle" };

  if (isLoading) {
    return (
      <div className="flex items-center gap-3 rounded-lg border border-zinc-800 bg-zinc-900/60 p-4 text-sm text-zinc-300">
        <span
          aria-hidden="true"
          className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-zinc-600 border-t-purple-500"
        />
        Checking live database state…
      </div>
    );
  }

  if (record.step === "error") {
    return (
      <div role="alert" className="rounded-lg border border-amber-500/50 bg-amber-950/30 p-4 text-sm text-amber-100">
        {record.message}
      </div>
    );
  }

  const { data } = record;

  if (data.status === "unavailable") {
    return (
      <div role="alert" className="rounded-lg border border-zinc-700 bg-zinc-900/60 p-4 text-sm text-zinc-300">
        <p className="text-xs font-semibold uppercase tracking-wide text-zinc-400">Live state unavailable</p>
        <p className="mt-2 leading-relaxed">{data.reason}</p>
      </div>
    );
  }

  if (data.status === "unexpected") {
    return (
      <div role="alert" className="rounded-lg border border-amber-500/50 bg-amber-950/30 p-4 text-sm text-amber-100">
        <p className="text-xs font-semibold uppercase tracking-wide text-amber-300">Unexpected live state</p>
        <p className="mt-2 leading-relaxed">{data.reason}</p>
        <p className="mt-2 text-xs text-amber-300/70">
          No repair or reset action is offered while the live state doesn&apos;t match a known configuration.
        </p>
      </div>
    );
  }

  if (data.status === "protected") {
    return (
      <div className="flex flex-col gap-4">
        <div className="rounded-lg border border-emerald-600/50 bg-emerald-950/30 p-5 text-emerald-100">
          <p className="text-sm font-semibold uppercase tracking-wide text-emerald-300">Live database protected</p>
          <p className="mt-2 text-sm leading-relaxed">
            {data.totalRowsReturned} row{data.totalRowsReturned === 1 ? "" : "s"} returned, 0 cross-tenant rows
            returned.
          </p>
          <p className="mt-3 text-sm leading-relaxed text-emerald-100/90">
            Source migration remains vulnerable; live database is currently protected.
          </p>
          <p className="mt-1 text-xs text-emerald-300/70">
            Configuration drift detected — the deployed policy no longer matches the checked-in migration.
          </p>
        </div>

        <button
          type="button"
          onClick={runReset}
          disabled={activeReset.step === "loading"}
          aria-busy={activeReset.step === "loading"}
          className="inline-flex h-10 w-fit items-center justify-center rounded-md bg-zinc-700 px-5 text-sm font-semibold text-white transition-colors hover:bg-zinc-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-zinc-400 focus-visible:ring-offset-2 focus-visible:ring-offset-black disabled:cursor-not-allowed disabled:opacity-60"
        >
          {activeReset.step === "loading" ? "Resetting…" : "Reset vulnerable demo"}
        </button>

        {activeReset.step === "error" && (
          <p role="alert" className="text-sm text-amber-300">
            {activeReset.message}
          </p>
        )}
      </div>
    );
  }

  // vulnerable
  return (
    <div className="flex flex-col gap-4">
      <div className="rounded-lg border border-red-500/50 bg-red-950/30 p-4 text-sm text-red-100">
        <p className="text-xs font-semibold uppercase tracking-wide text-red-300">Live database vulnerable</p>
      </div>
      <LiveValidationPanel repositoryUrl={repositoryUrl} />
    </div>
  );
}
