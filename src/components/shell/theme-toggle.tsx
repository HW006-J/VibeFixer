"use client";

import { useSyncExternalStore } from "react";
import { Icon } from "@/components/ui/icon";

type Theme = "light" | "dark";
const STORAGE_KEY = "vibe-fixer-theme";

/*
 * The theme is external state — it lives in localStorage and in the OS
 * preference, not in React. Modelling it with `useState` plus an effect meant
 * storing the value twice and re-rendering to catch up with a DOM attribute
 * that the blocking script in layout.tsx had already set.
 *
 * `useSyncExternalStore` reads it where it actually lives. That also gets the
 * server render right for free: the server snapshot is `null`, so the button
 * renders as a fixed-size placeholder until the client knows the answer, and
 * the header never changes width on hydration.
 *
 * Deliberately a two-state toggle rather than a three-state light/dark/system
 * menu. The unset default still follows the system preference — that lives in
 * the CSS — so "system" remains what you get until you express an opinion.
 */

const listeners = new Set<() => void>();

function subscribe(onChange: () => void) {
  listeners.add(onChange);
  /* `storage` fires in *other* tabs; the media query fires when the OS theme
     changes while no explicit choice is stored. Same-tab toggles are pushed
     by `emit` below, because localStorage does not notify its own writer. */
  const media = window.matchMedia("(prefers-color-scheme: light)");
  window.addEventListener("storage", onChange);
  media.addEventListener("change", onChange);

  return () => {
    listeners.delete(onChange);
    window.removeEventListener("storage", onChange);
    media.removeEventListener("change", onChange);
  };
}

function emit() {
  for (const listener of listeners) listener();
}

function getSnapshot(): Theme {
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (stored === "light" || stored === "dark") return stored;
  } catch {
    /* Private browsing can refuse reads; fall through to the OS preference. */
  }
  return window.matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark";
}

/* Returning null rather than a guess: the server cannot know, and rendering a
   sun that flips to a moon on hydration is worse than rendering neither. */
function getServerSnapshot(): Theme | null {
  return null;
}

export function ThemeToggle() {
  const theme = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  function toggle() {
    const next: Theme = theme === "light" ? "dark" : "light";
    document.documentElement.dataset.theme = next;
    try {
      window.localStorage.setItem(STORAGE_KEY, next);
    } catch {
      /* The toggle still works for this session; only the memory of it is
         lost, which is not worth surfacing as an error. */
    }
    emit();
  }

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
