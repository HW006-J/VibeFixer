"use client";

import { useEffect, useRef, useState } from "react";
import type { ScanApiResponse } from "@/lib/scanner/api-types";
import { ScanResult, type ScanResultState } from "./scan-result";

const AUTHORISED_REPOSITORY_URL = "https://github.com/HW006-J/rls-red-alert-demo-target";

const STAGES = [
  "Validating repository",
  "Locating Supabase migrations",
  "Inspecting RLS policies",
  "Producing findings",
] as const;

const STAGE_INTERVAL_MS = 550;
const MIN_PROGRESS_DISPLAY_MS = STAGE_INTERVAL_MS * STAGES.length;

function wait(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function RepositoryScanner() {
  const [repositoryUrl, setRepositoryUrl] = useState(AUTHORISED_REPOSITORY_URL);
  const [isScanning, setIsScanning] = useState(false);
  const [stageIndex, setStageIndex] = useState(0);
  const [result, setResult] = useState<ScanResultState | null>(null);
  const scanInFlight = useRef(false);

  useEffect(() => {
    if (!isScanning) return;

    const interval = setInterval(() => {
      setStageIndex((current) => Math.min(current + 1, STAGES.length - 1));
    }, STAGE_INTERVAL_MS);

    return () => clearInterval(interval);
  }, [isScanning]);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (scanInFlight.current) return;
    scanInFlight.current = true;

    setIsScanning(true);
    setStageIndex(0);
    setResult(null);

    const startedAt = Date.now();

    try {
      const response = await fetch("/api/scan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ repositoryUrl }),
      });

      const data = (await response.json()) as ScanApiResponse;

      // Real network latency can beat the staged-progress animation, which
      // would otherwise cut the demo's progress reveal short. Hold the
      // result until the stages have had time to visibly play out.
      const elapsed = Date.now() - startedAt;
      if (elapsed < MIN_PROGRESS_DISPLAY_MS) {
        await wait(MIN_PROGRESS_DISPLAY_MS - elapsed);
      }

      if (!data.ok) {
        setResult({ status: "error", error: data.error });
      } else {
        setResult({
          status: "success",
          repository: data.repository,
          filesScanned: data.filesScanned,
          findings: data.findings,
        });
      }
    } catch {
      setResult({
        status: "error",
        error: {
          code: "CLIENT_NETWORK_ERROR",
          message: "Could not reach the scan service. Check your connection and try again.",
        },
      });
    } finally {
      setIsScanning(false);
      scanInFlight.current = false;
    }
  }

  return (
    <div className="flex w-full flex-col gap-8">
      <form onSubmit={handleSubmit} className="flex flex-col gap-4 sm:flex-row sm:items-end">
        <div className="flex flex-1 flex-col gap-2">
          <label htmlFor="repository-url" className="text-sm font-medium text-zinc-300">
            GitHub repository URL
          </label>
          <input
            id="repository-url"
            name="repository-url"
            type="text"
            inputMode="url"
            autoComplete="off"
            spellCheck={false}
            value={repositoryUrl}
            onChange={(event) => setRepositoryUrl(event.target.value)}
            disabled={isScanning}
            className="w-full rounded-md border border-zinc-700 bg-zinc-900 px-4 py-2.5 font-mono text-sm text-zinc-100 outline-none transition-colors focus:border-red-500 focus:ring-2 focus:ring-red-500/40 disabled:opacity-60"
          />
          <span className="inline-flex w-fit items-center rounded-full border border-zinc-700 bg-zinc-900 px-2.5 py-0.5 text-xs text-zinc-400">
            Authorised demonstration repository
          </span>
        </div>

        <button
          type="submit"
          disabled={isScanning}
          className="inline-flex h-[42px] items-center justify-center rounded-md bg-red-600 px-6 text-sm font-semibold text-white transition-colors hover:bg-red-500 focus:outline-none focus-visible:ring-2 focus-visible:ring-red-400 focus-visible:ring-offset-2 focus-visible:ring-offset-black disabled:cursor-not-allowed disabled:opacity-60"
        >
          {isScanning ? "Scanning…" : "Scan repository"}
        </button>
      </form>

      <div aria-live="polite" className="flex flex-col gap-6">
        {isScanning && (
          <ol className="flex flex-col gap-2 rounded-lg border border-zinc-800 bg-zinc-900/60 p-4">
            {STAGES.map((stage, index) => (
              <li
                key={stage}
                className={`flex items-center gap-2 text-sm transition-colors ${
                  index <= stageIndex ? "text-zinc-100" : "text-zinc-600"
                }`}
              >
                <span
                  className={`h-1.5 w-1.5 rounded-full ${
                    index <= stageIndex ? "bg-red-500" : "bg-zinc-700"
                  }`}
                />
                {stage}
                {index === stageIndex ? "…" : ""}
              </li>
            ))}
          </ol>
        )}

        {!isScanning && result && <ScanResult state={result} />}
      </div>
    </div>
  );
}
