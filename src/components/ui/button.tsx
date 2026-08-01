"use client";

import { cn } from "./cn";
import { Icon, type IconName } from "./icon";

/*
 * The app's one button hierarchy.
 *
 * There is exactly one `primary` per screen region — it is the thing we want
 * pressed. `secondary` is for real but subordinate actions, `ghost` for
 * actions that should recede until looked for, and `danger` for the single
 * irreversible act (applying a repair to a live database).
 *
 * `primary` and `danger` are both red, which is a deliberate collision: in
 * this product the intended action *is* the alarming one, and giving them
 * different hues would imply a distinction that does not exist. They are
 * separated by fill weight and by an explicit confirmation on `danger`, not
 * by colour.
 */

type Variant = "primary" | "secondary" | "ghost" | "danger";
type Size = "sm" | "md" | "lg";

const VARIANTS: Record<Variant, string> = {
  primary:
    "bg-brand text-brand-fg shadow-sm hover:bg-brand-hover active:brightness-95 disabled:hover:bg-brand",
  secondary:
    "border border-line-strong bg-surface-raised text-fg hover:border-fg-subtle hover:bg-surface-hover active:brightness-95",
  ghost: "text-fg-muted hover:bg-surface-hover hover:text-fg active:brightness-95",
  danger:
    "border border-critical-border bg-critical text-critical-fg shadow-sm hover:brightness-110 active:brightness-95",
};

/*
 * Heights clear the 24×24 CSS px minimum of WCAG 2.2 SC 2.5.8 (Target Size)
 * with room to spare; `lg` additionally clears the 44×44 AAA threshold, which
 * is why the page's main call to action uses it.
 */
const SIZES: Record<Size, string> = {
  sm: "h-8 gap-1.5 px-2.5 text-xs",
  md: "h-9 gap-2 px-3.5 text-sm",
  lg: "h-11 gap-2 px-5 text-base",
};

const ICON_SIZES: Record<Size, number> = { sm: 14, md: 16, lg: 18 };

export type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: Variant;
  size?: Size;
  /** Leading icon. Hidden from assistive tech — the label carries the meaning. */
  icon?: IconName;
  /** Trailing icon, for "continue"-shaped actions. */
  iconTrailing?: IconName;
  /** Swaps the leading icon for a spinner and blocks input. */
  loading?: boolean;
  fullWidth?: boolean;
};

export function Button({
  variant = "secondary",
  size = "md",
  icon,
  iconTrailing,
  loading = false,
  fullWidth = false,
  disabled,
  className,
  children,
  ...rest
}: ButtonProps) {
  const isDisabled = disabled || loading;

  return (
    <button
      /* Defaulting to "button" matters: an unspecified <button> inside a form
         submits it, which has caused real bugs in filter toolbars. */
      type="button"
      disabled={isDisabled}
      /* Announces the pending state to screen readers without the label
         having to change out from under the user mid-press. */
      aria-busy={loading || undefined}
      className={cn(
        "inline-flex cursor-pointer items-center justify-center rounded-md font-semibold whitespace-nowrap",
        "transition-[background-color,border-color,color,filter] duration-150 ease-[var(--ease-out-soft)]",
        "disabled:cursor-not-allowed disabled:opacity-55",
        VARIANTS[variant],
        SIZES[size],
        fullWidth && "w-full",
        className,
      )}
      {...rest}
    >
      {loading ? (
        <Spinner size={ICON_SIZES[size]} />
      ) : (
        icon && <Icon name={icon} size={ICON_SIZES[size]} />
      )}
      {children}
      {iconTrailing && !loading && <Icon name={iconTrailing} size={ICON_SIZES[size]} />}
    </button>
  );
}

/*
 * A spinner rather than a skeleton, because the wait here is indeterminate —
 * a scan can take 400ms or 8s, and a progress bar that cannot be honest about
 * its position is worse than an honest indeterminate one.
 *
 * `currentColor` at reduced opacity for the track keeps it legible on every
 * button variant without a per-variant override.
 */
export function Spinner({ size = 16, className }: { size?: number; className?: string }) {
  return (
    <span
      aria-hidden="true"
      className={cn("inline-block animate-spin rounded-full border-2 border-current", className)}
      style={{
        width: size,
        height: size,
        borderTopColor: "transparent",
        opacity: 0.9,
      }}
    />
  );
}
