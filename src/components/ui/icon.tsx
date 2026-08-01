/*
 * A hand-rolled icon set.
 *
 * Deliberately not an icon library: this app needs roughly twenty glyphs, and
 * a dependency would ship a registry, a build step and a licence for that.
 * Everything here is drawn on a 24×24 grid with a 1.75 stroke and round caps,
 * which is what makes an in-house set read as a set rather than as clip art.
 *
 * Icons are decorative by default and hidden from assistive technology. Pass
 * `title` only when the icon is the *sole* carrier of meaning — an icon-only
 * button, for instance. An icon sitting beside its own text label must stay
 * hidden, or screen readers announce the label twice.
 */

export type IconName =
  | "search"
  | "command"
  | "close"
  | "chevron-down"
  | "chevron-right"
  | "check"
  | "critical"
  | "warning"
  | "info"
  | "shield-check"
  | "shield-alert"
  | "database"
  | "key"
  | "plug"
  | "file-code"
  | "external-link"
  | "copy"
  | "download"
  | "sparkles"
  | "sun"
  | "moon"
  | "filter"
  | "sort"
  | "play"
  | "refresh"
  | "pull-request"
  | "arrow-right"
  | "target";

const PATHS: Record<IconName, React.ReactNode> = {
  search: (
    <>
      <circle cx="11" cy="11" r="7" />
      <path d="m20 20-3.5-3.5" />
    </>
  ),
  command: <path d="M15 6a3 3 0 1 1 3 3h-3V6ZM9 6a3 3 0 1 0-3 3h3V6Zm0 12a3 3 0 1 1-3-3h3v3Zm6 0a3 3 0 1 0 3-3h-3v3ZM9 9h6v6H9z" />,
  close: <path d="M6 6l12 12M18 6L6 18" />,
  "chevron-down": <path d="m6 9 6 6 6-6" />,
  "chevron-right": <path d="m9 6 6 6-6 6" />,
  check: <path d="m5 13 4 4L19 7" />,
  critical: (
    <>
      <path d="M12 3 3 19h18L12 3Z" />
      <path d="M12 10v4" />
      <path d="M12 17.5v.01" />
    </>
  ),
  warning: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 8v4.5" />
      <path d="M12 16v.01" />
    </>
  ),
  info: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 11v5" />
      <path d="M12 8v.01" />
    </>
  ),
  "shield-check": (
    <>
      <path d="M12 3 5 6v6c0 4.2 2.9 7.9 7 9 4.1-1.1 7-4.8 7-9V6l-7-3Z" />
      <path d="m9 12 2 2 4-4" />
    </>
  ),
  "shield-alert": (
    <>
      <path d="M12 3 5 6v6c0 4.2 2.9 7.9 7 9 4.1-1.1 7-4.8 7-9V6l-7-3Z" />
      <path d="M12 9v3.5" />
      <path d="M12 15.5v.01" />
    </>
  ),
  database: (
    <>
      <ellipse cx="12" cy="6" rx="7" ry="3" />
      <path d="M5 6v12c0 1.7 3.1 3 7 3s7-1.3 7-3V6" />
      <path d="M5 12c0 1.7 3.1 3 7 3s7-1.3 7-3" />
    </>
  ),
  key: (
    <>
      <circle cx="8" cy="12" r="4" />
      <path d="M12 12h9" />
      <path d="M17 12v3.5" />
      <path d="M20 12v2.5" />
    </>
  ),
  plug: (
    <>
      <path d="M9 3v5" />
      <path d="M15 3v5" />
      <path d="M6 8h12v3a6 6 0 0 1-6 6 6 6 0 0 1-6-6V8Z" />
      <path d="M12 17v4" />
    </>
  ),
  "file-code": (
    <>
      <path d="M13 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V9l-6-6Z" />
      <path d="M13 3v6h6" />
      <path d="m10 13-2 2 2 2" />
      <path d="m14 13 2 2-2 2" />
    </>
  ),
  "external-link": (
    <>
      <path d="M14 4h6v6" />
      <path d="M20 4 11 13" />
      <path d="M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5" />
    </>
  ),
  copy: (
    <>
      <rect x="9" y="9" width="11" height="11" rx="2" />
      <path d="M5 15H4a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v1" />
    </>
  ),
  download: (
    <>
      <path d="M12 4v11" />
      <path d="m7 11 5 5 5-5" />
      <path d="M4 20h16" />
    </>
  ),
  sparkles: (
    <>
      <path d="M12 3.5 13.6 8l4.5 1.6-4.5 1.6L12 15.7l-1.6-4.5L5.9 9.6 10.4 8 12 3.5Z" />
      <path d="M18.5 15.5 19.3 18l2.5.8-2.5.8-.8 2.5-.8-2.5-2.5-.8 2.5-.8.8-2.5Z" />
    </>
  ),
  sun: (
    <>
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
    </>
  ),
  moon: <path d="M20 14.5A8.5 8.5 0 0 1 9.5 4a8.5 8.5 0 1 0 10.5 10.5Z" />,
  filter: <path d="M4 5h16l-6.5 7.5V19l-3-2v-4.5L4 5Z" />,
  sort: (
    <>
      <path d="M4 7h10M4 12h7M4 17h4" />
      <path d="M17 8v9" />
      <path d="m14 14 3 3 3-3" />
    </>
  ),
  play: <path d="M8 5.5v13l10-6.5-10-6.5Z" />,
  refresh: (
    <>
      <path d="M20 12a8 8 0 1 1-2.6-5.9" />
      <path d="M20 4v4.5h-4.5" />
    </>
  ),
  "pull-request": (
    <>
      <circle cx="7" cy="6" r="2.5" />
      <circle cx="7" cy="18" r="2.5" />
      <circle cx="17" cy="18" r="2.5" />
      <path d="M7 8.5v7" />
      <path d="M17 15.5V10a3 3 0 0 0-3-3h-2.5" />
      <path d="M14 4.5 11.5 7 14 9.5" />
    </>
  ),
  "arrow-right": (
    <>
      <path d="M4 12h15" />
      <path d="m13 6 6 6-6 6" />
    </>
  ),
  target: (
    <>
      <circle cx="12" cy="12" r="8" />
      <circle cx="12" cy="12" r="3.5" />
    </>
  ),
};

/* Icons whose meaning lives in a filled mass rather than an outline. Stroking
   these makes them look hollow next to the rest of the set. */
const FILLED: ReadonlySet<IconName> = new Set<IconName>(["play", "command", "sparkles", "moon"]);

export type IconProps = {
  name: IconName;
  /** Rendered size in px. Matches the 24px grid, so 16/20/24 stay crisp. */
  size?: number;
  className?: string;
  /**
   * Accessible name. Supply this only when no adjacent text conveys the same
   * thing; otherwise the icon stays `aria-hidden` and silent.
   */
  title?: string;
};

export function Icon({ name, size = 16, className, title }: IconProps) {
  const filled = FILLED.has(name);

  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill={filled ? "currentColor" : "none"}
      stroke={filled ? "none" : "currentColor"}
      strokeWidth={1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      /* Icons scale with their text but should never be squashed by a flex
         parent, which is the single most common way an icon set goes wrong. */
      style={{ flexShrink: 0 }}
      role={title ? "img" : undefined}
      aria-label={title}
      aria-hidden={title ? undefined : true}
      focusable="false"
    >
      {title && <title>{title}</title>}
      {PATHS[name]}
    </svg>
  );
}
