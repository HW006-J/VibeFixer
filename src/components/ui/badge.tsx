import { cn } from "./cn";
import { Icon, type IconName } from "./icon";

/*
 * A small, non-interactive status pill.
 *
 * Badges are read, not clicked — anything clickable is a Button or a filter
 * chip. Keeping that boundary firm is what stops a page of pills from feeling
 * like a page of broken buttons.
 */

type Tone = "neutral" | "brand" | "critical" | "high" | "medium" | "review" | "safe" | "info";

const TONES: Record<Tone, string> = {
  neutral: "border-line bg-surface-raised text-fg-muted",
  brand: "border-transparent bg-brand text-brand-fg",
  critical: "border-transparent bg-critical text-critical-fg",
  high: "border-high-border bg-high text-high-fg",
  medium: "border-medium-border bg-medium text-medium-fg",
  review: "border-review-border bg-review text-review-fg",
  safe: "border-safe-border bg-safe text-safe-fg",
  info: "border-info-border bg-info text-info-fg",
};

export type BadgeProps = {
  tone?: Tone;
  icon?: IconName;
  /** Uppercases and letter-spaces the label. For severity, not for prose. */
  uppercase?: boolean;
  mono?: boolean;
  className?: string;
  children: React.ReactNode;
};

export function Badge({
  tone = "neutral",
  icon,
  uppercase = false,
  mono = false,
  className,
  children,
}: BadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-semibold",
        TONES[tone],
        uppercase && "text-2xs tracking-wider uppercase",
        mono && "font-mono font-normal",
        className,
      )}
    >
      {icon && <Icon name={icon} size={12} />}
      {children}
    </span>
  );
}

/**
 * A count paired with a label, used in the overview strip.
 *
 * The number is the point, so it gets display weight and the label recedes —
 * the inverse of how these are usually built, and the reason the strip is
 * readable at a glance from across a room during a demo.
 */
export function Stat({
  value,
  label,
  tone = "neutral",
  className,
}: {
  value: React.ReactNode;
  label: string;
  tone?: Tone;
  className?: string;
}) {
  const isZero = value === 0;

  return (
    <div className={cn("flex flex-col gap-0.5", className)}>
      <span
        className={cn(
          "text-2xl font-bold tabular-nums",
          /* A zero is good news here. Muting it keeps the eye on the counts
             that actually demand action. */
          isZero ? "text-fg-subtle" : TONE_TEXT[tone],
        )}
      >
        {value}
      </span>
      <span className="text-2xs font-semibold tracking-wider text-fg-subtle uppercase">{label}</span>
    </div>
  );
}

const TONE_TEXT: Record<Tone, string> = {
  neutral: "text-fg",
  brand: "text-brand-accent",
  critical: "text-critical-accent",
  high: "text-high-fg",
  medium: "text-medium-fg",
  review: "text-review-fg",
  safe: "text-safe-fg",
  info: "text-info-fg",
};
