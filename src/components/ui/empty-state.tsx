import { cn } from "./cn";
import { Icon, type IconName } from "./icon";

/*
 * The states between "nothing here" and "here is your data".
 *
 * These are designed rather than defaulted, because they are where a user is
 * most likely to conclude the product is broken. Each one answers three
 * questions in order: what happened, why, and what to do next. An empty state
 * without that third part is just a shrug.
 */

type Tone = "neutral" | "safe" | "review" | "critical" | "info";

const TONES: Record<Tone, { surface: string; icon: string }> = {
  neutral: { surface: "border-line bg-surface", icon: "text-fg-subtle" },
  safe: { surface: "border-safe-border bg-safe", icon: "text-safe-fg" },
  review: { surface: "border-review-border bg-review", icon: "text-review-fg" },
  critical: { surface: "border-critical-border bg-critical-surface", icon: "text-critical-accent" },
  info: { surface: "border-info-border bg-info", icon: "text-info-fg" },
};

export type EmptyStateProps = {
  icon: IconName;
  title: string;
  description: React.ReactNode;
  tone?: Tone;
  /** The one thing to do next. Omit only when there genuinely isn't one. */
  action?: React.ReactNode;
  className?: string;
  /**
   * Marks this as an error the user should hear about immediately. Applies
   * `role="alert"`; leave it off for merely-empty states, which are not
   * interruptions.
   */
  alert?: boolean;
};

export function EmptyState({
  icon,
  title,
  description,
  tone = "neutral",
  action,
  className,
  alert = false,
}: EmptyStateProps) {
  const t = TONES[tone];

  return (
    <div
      role={alert ? "alert" : undefined}
      className={cn(
        "flex flex-col items-center gap-3 rounded-xl border px-6 py-10 text-center",
        t.surface,
        className,
      )}
    >
      <span
        className={cn(
          "flex h-11 w-11 items-center justify-center rounded-full border border-current/20 bg-current/5",
          t.icon,
        )}
      >
        <Icon name={icon} size={20} />
      </span>
      <div className="flex max-w-md flex-col gap-1.5">
        <p className="text-base font-semibold text-fg">{title}</p>
        <p className="text-sm leading-relaxed text-fg-muted">{description}</p>
      </div>
      {action}
    </div>
  );
}

/**
 * Skeleton placeholder for content whose shape we already know.
 *
 * Reserving the final height here is what keeps Cumulative Layout Shift near
 * zero when results arrive — the row does not grow, it only fills in.
 */
export function SkeletonRow({ className }: { className?: string }) {
  return (
    <div
      aria-hidden="true"
      className={cn(
        "flex h-[4.5rem] items-center gap-3 rounded-lg border border-line bg-surface px-4",
        className,
      )}
    >
      <span className="h-8 w-1 rounded-full bg-surface-hover" />
      <div className="flex flex-1 flex-col gap-2">
        <span className="block h-3 w-2/5 animate-pulse rounded bg-surface-hover" />
        <span className="block h-2.5 w-3/5 animate-pulse rounded bg-surface-hover opacity-60" />
      </div>
    </div>
  );
}
