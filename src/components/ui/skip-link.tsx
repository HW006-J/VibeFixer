/**
 * Bypass block for keyboard and screen-reader users (WCAG 2.4.1).
 *
 * Visually hidden until focused rather than `display: none`, because a
 * display-hidden element cannot receive focus at all and the link would never
 * appear. It is the first thing in the tab order by virtue of being the first
 * thing in the DOM.
 */
export function SkipLink({ href = "#main", children = "Skip to main content" }) {
  return (
    <a
      href={href}
      className="sr-only rounded-md bg-brand px-4 py-2 text-sm font-semibold text-brand-fg shadow-lg focus-visible:not-sr-only focus-visible:fixed focus-visible:top-3 focus-visible:left-3 focus-visible:z-[100]"
    >
      {children}
    </a>
  );
}
