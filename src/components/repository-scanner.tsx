"use client";

import { useRef, useState } from "react";
import type { ScanApiResponse } from "@/lib/scanner/api-types";
import { ScanResult, type ScanResultState } from "./scan-result";

const EXAMPLE_REPOSITORY_URL = "https://github.com/HW006-J/rls-red-alert-demo-target";

export function RepositoryScanner() {
  const [repositoryUrl, setRepositoryUrl] = useState(EXAMPLE_REPOSITORY_URL);
  const [isScanning, setIsScanning] = useState(false);
  const [result, setResult] = useState<ScanResultState | null>(null);
  const scanInFlight = useRef(false);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (scanInFlight.current) return;
    scanInFlight.current = true;

    const submittedUrl = repositoryUrl;
    setIsScanning(true);
    setResult(null);

    try {
      const response = await fetch("/api/scan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ repositoryUrl: submittedUrl }),
      });

      const data = (await response.json()) as ScanApiResponse;

      if (!data.ok) {
        setResult({ status: "error", error: data.error });
      } else {
        setResult({
          status: "success",
          repository: data.repository,
          repositoryUrl: submittedUrl,
          isDemoRepository: data.isDemoRepository,
          filesScanned: data.filesScanned,
          policiesInspected: data.policiesInspected,
          findings: data.findings,
          durationMs: data.durationMs,
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
          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex w-fit items-center rounded-full border border-zinc-700 bg-zinc-900 px-2.5 py-0.5 text-xs text-zinc-400">
              Public repository static analysis
            </span>
            <span className="text-xs text-zinc-500">
              Only scan repositories you own or are authorised to review.
            </span>
          </div>
        </div>

        <button
          type="submit"
          disabled={isScanning}
          aria-busy={isScanning}
          className="inline-flex h-[42px] items-center justify-center rounded-md bg-red-600 px-6 text-sm font-semibold text-white transition-colors hover:bg-red-500 focus:outline-none focus-visible:ring-2 focus-visible:ring-red-400 focus-visible:ring-offset-2 focus-visible:ring-offset-black disabled:cursor-not-allowed disabled:opacity-60"
        >
          {isScanning ? "Scanning…" : "Scan repository"}
        </button>
      </form>

      <div aria-live="polite" className="flex flex-col gap-6">
        {isScanning && (
          <div className="flex items-center gap-3 rounded-lg border border-zinc-800 bg-zinc-900/60 p-4 text-sm text-zinc-300">
            <span
              aria-hidden="true"
              className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-zinc-600 border-t-red-500"
            />
            Scanning repository…
          </div>
        )}

        {!isScanning && result && <ScanResult state={result} />}
      </div>
    </div>
  );
}
