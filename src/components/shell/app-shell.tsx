"use client";

import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useRef, useState } from "react";
import { ScanResult, type ScanResultState } from "@/components/scan-result";
import { EmptyState, SkeletonRow } from "@/components/ui/empty-state";
import { SkipLink } from "@/components/ui/skip-link";
import type { ScanApiResponse } from "@/lib/scanner/api-types";
import { AppBar } from "./app-bar";
import { CommandPalette } from "./command-palette";
import { FindabilityProvider } from "./findability-context";
import { ScanForm } from "./scan-form";
import { Section } from "./section";

const EXAMPLE_REPOSITORY_URL = "https://github.com/HW006-J/rls-red-alert-demo-target";

/*
 * Owns scan state and hosts the findability chrome.
 *
 * State lives here rather than in the results component because the app bar,
 * the rail and the command palette all sit *above* the results in the tree and
 * all need to read them — the risk pill and the palette's search index are
 * both derived from the same scan response.
 *
 * The fetch logic below is carried over unchanged from the previous
 * RepositoryScanner, including the in-flight guard and the scan token that
 * forces downstream live-state checks to re-derive on every submission.
 */
export function AppShell() {
  const [repositoryUrl, setRepositoryUrl] = useState(EXAMPLE_REPOSITORY_URL);
  const [isScanning, setIsScanning] = useState(false);
  const [result, setResult] = useState<ScanResultState | null>(null);
  const scanInFlight = useRef(false);
  // Incremented on every scan submission (even of the same URL) so
  // downstream live-state checks always re-derive from a fresh server
  // check on rescan instead of reusing a result carried over from before.
  const scanTokenRef = useRef(0);
  const reduceMotion = useReducedMotion();

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (scanInFlight.current) return;
    scanInFlight.current = true;
    scanTokenRef.current += 1;
    const scanToken = scanTokenRef.current;

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
          findings: data.findings,
          unifiedFindings: data.unifiedFindings,
          securityReport: data.securityReport,
          coverage: data.coverage,
          durationMs: data.durationMs,
          scanToken,
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

  const success = result?.status === "success" ? result : null;

  return (
    <FindabilityProvider
      findings={success?.unifiedFindings ?? []}
      report={success?.securityReport ?? null}
      repository={success?.repository ?? null}
      isScanning={isScanning}
    >
      <SkipLink />
      <AppBar />

      <main id="main" className="mx-auto w-full max-w-5xl flex-1 px-4 pt-8 pb-24 sm:px-6">
        <div className="mb-10 flex flex-col gap-2">
          <h1 className="text-3xl font-bold tracking-tight text-fg sm:text-display">
            Security checks for AI-built applications
          </h1>
          <p className="max-w-2xl text-base leading-relaxed text-fg-muted">
            Vibe Fixer scans repositories for common database, cloud-permission, secret-exposure
            and API-access mistakes. In an authorised environment, it can also prove, repair and
            retest one confirmed database finding live.
          </p>
        </div>

        <div className="flex flex-col gap-12">
          <Section
            id="scan"
            label="Scan"
            icon="target"
            order={0}
            description="Point Vibe Fixer at a public repository to analyse."
          >
            <ScanForm
              repositoryUrl={repositoryUrl}
              onChange={setRepositoryUrl}
              onSubmit={handleSubmit}
              isScanning={isScanning}
            />
          </Section>

          {/* The results region is a live region so a scan completing is
              announced, rather than silently replacing the page for anyone not
              watching it. `polite` because a finished scan is information, not
              an interruption. */}
          <div aria-live="polite" aria-busy={isScanning}>
            <AnimatePresence mode="wait" initial={false}>
              {isScanning && (
                <motion.div
                  key="scanning"
                  initial={reduceMotion ? { opacity: 0 } : { opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
                  className="flex flex-col gap-3"
                >
                  {/* Skeletons in the shape of the results that are coming, so
                      the arriving content fills reserved space instead of
                      pushing the page around (CLS). */}
                  <p className="text-sm text-fg-muted">Scanning repository…</p>
                  <SkeletonRow />
                  <SkeletonRow className="opacity-70" />
                  <SkeletonRow className="opacity-40" />
                </motion.div>
              )}

              {!isScanning && result && (
                <motion.div
                  key={`result-${success?.scanToken ?? "error"}`}
                  initial={reduceMotion ? { opacity: 0 } : { opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.24, ease: [0.22, 1, 0.36, 1] }}
                >
                  <Section
                    id="findings"
                    label="Findings"
                    icon="critical"
                    order={1}
                    count={success?.unifiedFindings.length}
                    description={
                      success
                        ? `Static analysis of ${success.repository}.`
                        : "The scan could not be completed."
                    }
                  >
                    <ScanResult state={result} />
                  </Section>
                </motion.div>
              )}

              {!isScanning && !result && (
                <motion.div
                  key="idle"
                  initial={reduceMotion ? { opacity: 0 } : { opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
                >
                  <EmptyState
                    icon="target"
                    title="No scan yet"
                    description="Run a scan to see findings here. The example repository above contains a deliberate Supabase row-level-security flaw, which the demo can prove and repair against a live database."
                  />
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>
      </main>

      <CommandPalette />
    </FindabilityProvider>
  );
}
