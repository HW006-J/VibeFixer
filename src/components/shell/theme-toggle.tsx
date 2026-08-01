"use client";

import { useEffect, useState } from "react";
import { Icon } from "@/components/ui/icon";

type Theme = "light" | "dark";
const STORAGE_KEY = "vibe-fixer-theme";

/**
 * Light/dark switch.
 *
 * Deliberately a two-state toggle rather than a three-state light/dark/system
 * menu. A menu is the more complete answer, but it costs a popover and a
 * third concept for a demo tool whose users will flip this at most once. The
 * unset default still follows the system preference — that behaviour lives in
 * the CSS, so "system" remains the state you get until you express an opinion.
 */
export function ThemeToggle() {
  const [theme, setTheme] = useState<Theme | null>(null);

  /* Read on mount rather than during render: the server has no access to
     localStorage, and reading it during render would desynchronise the
     markup React hydrates against. The blocking script in layout.tsx has
     already applied the visual result by this point, so there is no flash. */
  useEffect(() => {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (stored === "light" || stored === "dark") {
      setTheme(stored);
      return;
    }
    setTheme(window.matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark");
  }, []);

  function toggle() {
    const next: Theme = theme === "light" ? "dark" : "light";
    setTheme(next);
    document.documentElement.dataset.theme = next;
    try {
      window.localStorage.setItem(STORAGE_KEY, next);
    } catch {
      /* Private browsing can refuse writes. The toggle still works for this
         session; only the memory of it is lost, which is not worth an error. */
    }
  }

  /* Renders a stable placeholder until the theme is known, so the header does
     not change width on hydration (a small but real layout shift). */
  if (theme === null) {
    return <span className="h-9 w-9" aria-hidden="true" />;
  }

  const nextLabel = theme === "light" ? "Switch to dark theme" : "Switch to light theme";

  return (
    <button
      type="button"
      onClick={toggle}
      title={nextLabel}
      aria-label={nextLabel}
      className="inline-flex h-9 w-9 cursor-pointer items-center justify-center rounded-md text-fg-muted transition-colors duration-150 hover:bg-surface-hover hover:text-fg"
    >
      <Icon name={theme === "light" ? "moon" : "sun"} size={18} />
    </button>
  );
}
