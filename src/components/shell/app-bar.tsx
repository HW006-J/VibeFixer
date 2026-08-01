"use client";

import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { cn } from "@/components/ui/cn";
import { Icon } from "@/components/ui/icon";
import { SEVERITY, SEVERITY_KEYS } from "@/components/ui/severity";
import type { UnifiedSeverity } from "@/lib/security/finding";
import type { SecurityReport } from "@/lib/security/report";
import { useFindability } from "./findability-context";
import { SectionRail } from "./section-rail";
import { ThemeToggle } from "./theme-toggle";

/*
 * The persistent chrome: identity, search, and the one number that matters.
 *
 * The risk pill exists because the executive summary card scrolls away after
 * about one screen, and from that point on nothing on the page told you how
 * bad things were. Carrying the worst count in the header means the answer to
 * "how bad is this" is never more than a glance away, at any scroll depth.
 */

/** The most severe level with at least one finding. SEVERITY_KEYS is ordered
    worst-first, so the first hit is the answer. */
function worstSeverity(counts: SecurityReport["counts"]): UnifiedSeverity | null {
  for (const key of SEVERITY_KEYS) {
    if (counts[key] > 0) return key;
  }
  return null;
}

export function AppBar() {
  const { report, findings, isScanning, setPaletteOpen, goToSection, sections } = useFindability();
  const reduceMotion = useReducedMotion();

  const worst = report ? worstSeverity(report.counts) : null;
  const worstCount = worst && report ? report.counts[worst] : 0;
  const hasFindings = findings.length > 0;

  return (
    <header className="sticky top-0 z-50 border-b border-line bg-canvas/85 backdrop-blur-md supports-[backdrop-filter]:bg-canvas/70">
      <div className="mx-auto flex h-14 w-full max-w-5xl items-center gap-2 px-4 sm:gap-3 sm:px-6">
        {/* Identity. The pulsing dot is the product's one piece of decorative
            motion, and it earns its place by signalling "live tool, not a
            static report" — the single most common misreading of this page. */}
        <a
          href="#main"
          onClick={(e) => {
            e.preventDefault();
            window.scrollTo({ top: 0, behavior: reduceMotion ? "auto" : "smooth" });
          }}
          className="flex shrink-0 items-center gap-2 rounded-md text-fg"
        >
          <span className="relative flex h-2 w-2" aria-hidden="true">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-brand opacity-60" />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-brand" />
          </span>
          <span className="text-sm font-bold tracking-tight">Vibe Fixer</span>
        </a>

        {/* Search. Always present, always in the same place, whether or not
            there is anything to search yet — a control that appears only once
            results exist cannot become a habit. */}
        <button
          type="button"
          onClick={() => setPaletteOpen(true)}
          className={cn(
            "group ml-auto flex h-9 min-w-0 flex-1 cursor-pointer items-center gap-2 rounded-md border border-line bg-surface px-3 text-left",
            "transition-colors duration-150 hover:border-line-strong hover:bg-surface-hover",
            "sm:ml-2 sm:max-w-xs",
          )}
          aria-keyshortcuts="Meta+K Control+K"
        >
          <Icon name="search" size={15} className="text-fg-subtle" />
          <span className="hidden truncate text-sm text-fg-subtle sm:inline">
            {hasFindings ? `Search ${findings.length} findings…` : "Search findings…"}
          </span>
          <kbd className="ml-auto hidden shrink-0 items-center gap-0.5 rounded border border-line bg-canvas px-1.5 py-0.5 font-mono text-2xs text-fg-subtle sm:inline-flex">
            <span className="text-[0.9em]">⌘</span>K
          </kbd>
        </button>

        {/* Risk pill. Enters and leaves rather than popping, so a rescan that
            changes the verdict reads as a change rather than as a glitch. */}
        <AnimatePresence mode="popLayout" initial={false}>
          {worst && !isScanning && (
            <motion.button
              key={`${worst}-${worstCount}`}
              type="button"
              onClick={() => goToSection("findings")}
              initial={reduceMotion ? false : { opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={reduceMotion ? { opacity: 0 } : { opacity: 0, scale: 0.9 }}
              transition={{ duration: 0.18, ease: [0.22, 1, 0.36, 1] }}
              className={cn(
                "inline-flex shrink-0 cursor-pointer items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold",
                SEVERITY[worst].badge,
              )}
              title={`Jump to findings — ${worstCount} ${SEVERITY[worst].label}`}
            >
              <Icon name={SEVERITY[worst].icon} size={13} />
              <span className="tabular-nums">{worstCount}</span>
              <span className="hidden sm:inline">{SEVERITY[worst].label}</span>
            </motion.button>
          )}
        </AnimatePresence>

        <ThemeToggle />
      </div>

      {sections.length > 0 && <SectionRail />}
    </header>
  );
}
