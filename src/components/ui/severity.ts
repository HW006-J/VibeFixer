import type { SecurityCategory, UnifiedSeverity } from "@/lib/security/finding";
import type { IconName } from "./icon";

/*
 * The single source of truth for how severity and category look.
 *
 * Every visual decision about a severity lives here, so a card, a badge, a
 * filter chip and a count all agree without coordinating. Previously each
 * component carried its own `switch (severity)`, and they had already drifted
 * apart — the badge palette and the card palette disagreed on `review`.
 *
 * Severity is never signalled by colour alone: each level carries a distinct
 * icon and a distinct word, which is what makes the list usable for the ~8%
 * of men with a colour-vision deficiency (WCAG 1.4.1, Use of Colour).
 */

export type SeverityVisual = {
  /** Human label, lower case — rendered uppercase by the badge itself. */
  label: string;
  icon: IconName;
  /** Solid pill, used where severity must dominate. */
  badge: string;
  /** Card/panel background and border. */
  surface: string;
  /** Text colour for the severity word when it appears outside a pill. */
  accent: string;
  /** The left rule on a finding row — the fastest severity signal when scanning. */
  rail: string;
};

export const SEVERITY: Record<UnifiedSeverity, SeverityVisual> = {
  critical: {
    label: "critical",
    icon: "critical",
    badge: "bg-critical text-critical-fg",
    surface: "border-critical-border bg-critical-surface",
    accent: "text-critical-accent",
    rail: "bg-critical",
  },
  high: {
    label: "high",
    icon: "shield-alert",
    badge: "bg-high text-high-fg border border-high-border",
    surface: "border-high-border bg-high",
    accent: "text-high-fg",
    rail: "bg-high-fg",
  },
  medium: {
    label: "medium",
    icon: "warning",
    badge: "bg-medium text-medium-fg border border-medium-border",
    surface: "border-medium-border bg-medium",
    accent: "text-medium-fg",
    rail: "bg-medium-fg",
  },
  review: {
    label: "needs review",
    icon: "info",
    badge: "bg-review text-review-fg border border-review-border",
    surface: "border-review-border bg-review",
    accent: "text-review-fg",
    rail: "bg-review-fg",
  },
};

/** Sort order for display. Critical first — always. */
export const SEVERITY_ORDER: Record<UnifiedSeverity, number> = {
  critical: 0,
  high: 1,
  medium: 2,
  review: 3,
};

export const SEVERITY_KEYS: UnifiedSeverity[] = ["critical", "high", "medium", "review"];

/*
 * Category icons. These carry less weight than severity — they answer "which
 * part of my system" rather than "how bad", so they are drawn in muted
 * foreground and never tinted by severity.
 */
export const CATEGORY_ICON: Record<SecurityCategory, IconName> = {
  supabase: "database",
  iam: "shield-check",
  secret: "key",
  endpoint: "plug",
};

export const CATEGORY_KEYS: SecurityCategory[] = ["supabase", "iam", "secret", "endpoint"];
