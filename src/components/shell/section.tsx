"use client";

import { useEffect } from "react";
import { cn } from "@/components/ui/cn";
import { Icon, type IconName } from "@/components/ui/icon";
import { useFindability } from "./findability-context";

/**
 * A landmark section that puts itself on the map.
 *
 * Registering on mount is what lets the rail and the command palette list
 * sections without knowing which ones exist — see findability-context for why
 * that matters here.
 *
 * It also repairs the document outline. The page previously jumped from the
 * `h1` straight to `h3` finding titles, with "Top findings" and "All findings"
 * marked up as plain paragraphs, so heading-based navigation skipped the
 * structure entirely. Every section now contributes a real `h2`.
 */
export function Section({
  id,
  label,
  icon,
  order,
  count,
  description,
  action,
  children,
  className,
}: {
  id: string;
  label: string;
  icon: IconName;
  order: number;
  count?: number;
  /** One line under the heading. Say what the section is for, not what it is. */
  description?: string;
  /** Section-level action, right-aligned with the heading. */
  action?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  const { registerSection } = useFindability();

  useEffect(
    () => registerSection({ id, label, icon, order, count }),
    [registerSection, id, label, icon, order, count],
  );

  return (
    <section
      id={id}
      aria-labelledby={`${id}-heading`}
      /* Clears the sticky header when this is a scroll or anchor target.
         Without it the heading lands underneath the chrome. */
      className={cn("scroll-mt-28 focus:outline-none", className)}
    >
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div className="flex flex-col gap-1">
          <h2
            id={`${id}-heading`}
            className="flex items-center gap-2 text-lg font-semibold tracking-tight text-fg"
          >
            <Icon name={icon} size={18} className="text-fg-subtle" />
            {label}
            {count !== undefined && (
              <span className="text-sm font-normal tabular-nums text-fg-subtle">({count})</span>
            )}
          </h2>
          {description && <p className="text-sm text-fg-muted">{description}</p>}
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}
