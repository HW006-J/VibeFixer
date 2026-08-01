"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type { UnifiedFinding } from "@/lib/security/finding";
import type { SecurityReport } from "@/lib/security/report";
import type { IconName } from "@/components/ui/icon";

/*
 * The navigation substrate for a single-page application.
 *
 * This app has one route, so "where am I" cannot be answered by a URL. It is
 * answered instead by a registry: each section declares itself on mount, and
 * the chrome — app bar, rail, command palette — renders whatever is currently
 * registered. Sections therefore stay owned by the components that render
 * them, and the chrome never has to hardcode a list that would silently rot
 * as sections come and go with scan state.
 *
 * The alternative, a static array of section descriptors, was rejected
 * because half these sections are conditional: the live-proof panel only
 * exists for the demo repository, and the findings section only exists after
 * a scan. A hardcoded rail would point at anchors that are not on the page.
 */

export type SectionMeta = {
  id: string;
  label: string;
  icon: IconName;
  /** Rendered beside the label in the rail. Omit when a count is meaningless. */
  count?: number;
  /** Ascending display order. Sections declare it so registration order — which
      depends on React's mount sequence — cannot affect the rail. */
  order: number;
};

type FindabilityValue = {
  /** Findings currently on the page, for search and for counts. */
  findings: UnifiedFinding[];
  report: SecurityReport | null;
  repository: string | null;
  isScanning: boolean;

  sections: SectionMeta[];
  registerSection: (meta: SectionMeta) => () => void;
  activeSectionId: string | null;
  /** Scrolls to a section and moves keyboard focus there. */
  goToSection: (id: string) => void;

  paletteOpen: boolean;
  setPaletteOpen: (open: boolean) => void;
  /** Set by the palette when a finding is chosen, so the list can highlight it. */
  focusedFindingId: string | null;
  focusFinding: (id: string) => void;
};

const FindabilityContext = createContext<FindabilityValue | null>(null);

export function useFindability(): FindabilityValue {
  const ctx = useContext(FindabilityContext);
  if (!ctx) {
    throw new Error("useFindability must be used inside <FindabilityProvider>");
  }
  return ctx;
}

/**
 * Scrolls an element into view and gives it focus.
 *
 * Scrolling alone is a sighted-only affordance: a keyboard or screen-reader
 * user who activates a rail link would have the viewport move while their
 * focus stayed behind, so the next Tab would continue from the old position.
 * Setting `tabIndex = -1` first makes the section programmatically focusable
 * without adding it to the tab order.
 */
function scrollAndFocus(el: HTMLElement, reduceMotion: boolean) {
  el.scrollIntoView({ behavior: reduceMotion ? "auto" : "smooth", block: "start" });
  el.tabIndex = -1;
  el.focus({ preventScroll: true });
}

export function FindabilityProvider({
  findings,
  report,
  repository,
  isScanning,
  children,
}: {
  findings: UnifiedFinding[];
  report: SecurityReport | null;
  repository: string | null;
  isScanning: boolean;
  children: React.ReactNode;
}) {
  const [sections, setSections] = useState<SectionMeta[]>([]);
  const [activeSectionId, setActiveSectionId] = useState<string | null>(null);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [focusedFindingId, setFocusedFindingId] = useState<string | null>(null);

  /*
   * Suppresses scroll-spy while a programmatic scroll is in flight. Without
   * it, smooth-scrolling past three sections to reach the fourth lights each
   * one up in turn, and the rail flickers through states the user never asked
   * for. Cleared on the first settled scroll after arrival.
   */
  const navigatingRef = useRef(false);

  const registerSection = useCallback((meta: SectionMeta) => {
    setSections((prev) => {
      const next = prev.filter((s) => s.id !== meta.id);
      next.push(meta);
      return next.sort((a, b) => a.order - b.order);
    });
    return () => setSections((prev) => prev.filter((s) => s.id !== meta.id));
  }, []);

  const goToSection = useCallback((id: string) => {
    const el = document.getElementById(id);
    if (!el) return;

    navigatingRef.current = true;
    setActiveSectionId(id);

    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    scrollAndFocus(el, reduce);

    window.setTimeout(() => {
      navigatingRef.current = false;
    }, 700);
  }, []);

  const focusFinding = useCallback((id: string) => {
    setFocusedFindingId(id);
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    /*
     * Falls back to the findings section when the individual card carries no
     * anchor yet. The finding list still renders as one undifferentiated
     * block, so per-finding anchors do not exist; landing the user on the
     * right section is the honest approximation, and this upgrades to an
     * exact jump for free once the cards gain `finding-<id>` ids.
     */
    const target =
      document.getElementById(`finding-${id}`) ?? document.getElementById("findings");
    if (target) scrollAndFocus(target, reduce);
  }, []);

  /*
   * Scroll spy.
   *
   * The rule is "the section that owns the top of the viewport", not "the
   * section closest to the middle" — a reader looks at the top of what they
   * just scrolled to, and a midpoint rule marks a section active while its
   * heading is still off screen. The top band is offset by the sticky header
   * so a section counts as current the moment it clears the chrome.
   */
  useEffect(() => {
    /*
     * Every state write below is deferred to an animation frame rather than
     * run in the effect body. Two reasons, one correctness and one cosmetic:
     * measuring geometry synchronously on mount reads a layout React has not
     * finished committing, and writing state during the effect forces an
     * immediate second render pass before the browser has painted the first.
     */
    if (sections.length === 0) {
      const raf = requestAnimationFrame(() => setActiveSectionId(null));
      return () => cancelAnimationFrame(raf);
    }

    const elements = sections
      .map((s) => document.getElementById(s.id))
      .filter((el): el is HTMLElement => el !== null);

    if (elements.length === 0) return;

    function recompute() {
      if (navigatingRef.current) return;

      const headerOffset = 120;
      let current: string | null = null;

      for (const el of elements) {
        if (el.getBoundingClientRect().top <= headerOffset) {
          current = el.id;
        }
      }

      /* Before the first section reaches the header line, the first section is
         still the honest answer — "none" would blank the rail at page top. */
      setActiveSectionId(current ?? elements[0].id);
    }

    const raf = requestAnimationFrame(recompute);
    window.addEventListener("scroll", recompute, { passive: true });
    window.addEventListener("resize", recompute);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("scroll", recompute);
      window.removeEventListener("resize", recompute);
    };
  }, [sections]);

  /* ⌘K / Ctrl-K opens the palette from anywhere, including from inside a text
     field — which is why this listens on the document rather than on a form. */
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "k" && (event.metaKey || event.ctrlKey)) {
        event.preventDefault();
        setPaletteOpen((open) => !open);
      }
      /* "/" is the other conventional search key, but only when the user is
         not already typing — otherwise it hijacks every slash in a URL. */
      if (event.key === "/" && !isEditable(event.target)) {
        event.preventDefault();
        setPaletteOpen(true);
      }
    }

    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, []);

  const value = useMemo<FindabilityValue>(
    () => ({
      findings,
      report,
      repository,
      isScanning,
      sections,
      registerSection,
      activeSectionId,
      goToSection,
      paletteOpen,
      setPaletteOpen,
      focusedFindingId,
      focusFinding,
    }),
    [
      findings,
      report,
      repository,
      isScanning,
      sections,
      registerSection,
      activeSectionId,
      goToSection,
      paletteOpen,
      focusedFindingId,
      focusFinding,
    ],
  );

  return <FindabilityContext.Provider value={value}>{children}</FindabilityContext.Provider>;
}

function isEditable(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || target.isContentEditable;
}
