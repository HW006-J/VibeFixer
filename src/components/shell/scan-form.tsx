"use client";

import { motion, useReducedMotion } from "motion/react";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";

/*
 * The page's entry point, and the only screen with a genuinely unambiguous
 * primary action.
 *
 * The scan button is `lg` while every other control on the page is `md` or
 * `sm`. That size gap is the hierarchy — before a scan there is exactly one
 * thing to do here, and it should be impossible to miss.
 */
export function ScanForm({
  repositoryUrl,
  onChange,
  onSubmit,
  isScanning,
}: {
  repositoryUrl: string;
  onChange: (value: string) => void;
  onSubmit: (event: React.FormEvent<HTMLFormElement>) => void;
  isScanning: boolean;
}) {
  const reduceMotion = useReducedMotion();

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-3">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start">
        <div className="flex flex-1 flex-col gap-1.5">
          <label htmlFor="repository-url" className="text-sm font-medium text-fg">
            GitHub repository URL
          </label>
          <div className="relative">
            <span className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-fg-subtle">
              <Icon name="file-code" size={16} />
            </span>
            <input
              id="repository-url"
              name="repository-url"
              type="text"
              inputMode="url"
              autoComplete="off"
              spellCheck={false}
              value={repositoryUrl}
              onChange={(event) => onChange(event.target.value)}
              disabled={isScanning}
              aria-describedby="repository-url-help"
              className="h-11 w-full rounded-md border border-line bg-surface pr-3 pl-9 font-mono text-sm text-fg transition-colors outline-none placeholder:text-fg-subtle hover:border-line-strong focus:border-brand disabled:opacity-60"
            />
          </div>
        </div>

        {/* Aligned to the input's baseline rather than the label's, so the two
            controls read as one row on desktop without a magic offset. */}
        <Button
          type="submit"
          variant="primary"
          size="lg"
          loading={isScanning}
          icon="play"
          disabled={isScanning}
          className="sm:mt-[1.625rem]"
        >
          {isScanning ? "Scanning…" : "Scan repository"}
        </Button>
      </div>

      <p id="repository-url-help" className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs">
        <span className="inline-flex items-center gap-1 rounded-full border border-line bg-surface px-2 py-0.5 text-fg-muted">
          <Icon name="shield-check" size={11} />
          Public repository static analysis
        </span>
        <span className="text-fg-subtle">
          Only scan repositories you own or are authorised to review.
        </span>
      </p>

      {/* Progress. An indeterminate bar rather than a percentage, because the
          server reports no stages — inventing a progress figure would be a
          lie the user has no way to check. */}
      {isScanning && !reduceMotion && (
        <div
          className="h-0.5 w-full overflow-hidden rounded-full bg-surface-hover"
          role="presentation"
        >
          <motion.div
            className="h-full w-1/3 rounded-full bg-brand"
            animate={{ x: ["-100%", "300%"] }}
            transition={{ duration: 1.1, repeat: Infinity, ease: "easeInOut" }}
          />
        </div>
      )}
    </form>
  );
}
