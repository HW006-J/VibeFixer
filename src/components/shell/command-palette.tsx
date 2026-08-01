"use client";

import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { cn } from "@/components/ui/cn";
import { Icon, type IconName } from "@/components/ui/icon";
import { CATEGORY_ICON, SEVERITY, SEVERITY_ORDER } from "@/components/ui/severity";
import type { UnifiedFinding } from "@/lib/security/finding";
import { categoryLabel } from "@/lib/security/report";
import { useFindability } from "./findability-context";

/*
 * The command palette.
 *
 * The page previously offered six category chips and nothing else, so finding
 * a specific issue meant reading every card. This makes any finding reachable
 * in a few keystrokes by title, rule id, file path or category, and doubles as
 * the jump-to-section control.
 *
 * It follows the ARIA combobox-with-listbox pattern: focus stays in the input
 * at all times and the active option is communicated through
 * `aria-activedescendant`. That is what lets arrow keys move a selection while
 * the user keeps typing — roving `tabindex` cannot do both at once.
 */

const RECENTS_KEY = "vibe-fixer-recent-findings";
const MAX_RECENTS = 4;

type Item =
  | { kind: "section"; id: string; label: string; icon: IconName; hint?: string }
  | { kind: "finding"; id: string; finding: UnifiedFinding };

type Group = { heading: string; items: Item[] };

/*
 * Scores a finding against the query.
 *
 * Weighted so that a title match beats a rule-id match beats a path match: a
 * user typing "clients" almost always means the finding about the clients
 * table, not every finding in a file whose path happens to contain it. Returns
 * null for no match so filtering and scoring stay one pass.
 */
function score(finding: UnifiedFinding, query: string): number | null {
  const q = query.toLowerCase();
  const title = finding.title.toLowerCase();

  if (title.startsWith(q)) return 100;
  if (title.includes(q)) return 80;
  if (finding.ruleId.toLowerCase().includes(q)) return 60;
  if (finding.filePath.toLowerCase().includes(q)) return 40;
  if (categoryLabel(finding.category).toLowerCase().includes(q)) return 30;
  if (finding.severity.toLowerCase().startsWith(q)) return 25;
  return null;
}

function readRecents(): string[] {
  try {
    const raw = window.localStorage.getItem(RECENTS_KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed.filter((x): x is string => typeof x === "string") : [];
  } catch {
    return [];
  }
}

export function CommandPalette() {
  const { paletteOpen, setPaletteOpen, findings, sections, goToSection, focusFinding } =
    useFindability();
  const reduceMotion = useReducedMotion();

  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);
  const [recentIds, setRecentIds] = useState<string[]>([]);

  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  /* Where focus was before the palette opened, so it can be given back.
     Losing focus to <body> on close is one of the most disorienting things a
     dialog can do to a keyboard user. */
  const restoreFocusRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!paletteOpen) return;

    restoreFocusRef.current = document.activeElement as HTMLElement | null;
    setQuery("");
    setActiveIndex(0);
    setRecentIds(readRecents());

    /* Scroll lock. Compensating for the scrollbar's width prevents the page
       behind from jolting sideways as it disappears. */
    const { body } = document;
    const scrollBarWidth = window.innerWidth - document.documentElement.clientWidth;
    const prevOverflow = body.style.overflow;
    const prevPadding = body.style.paddingRight;
    body.style.overflow = "hidden";
    if (scrollBarWidth > 0) body.style.paddingRight = `${scrollBarWidth}px`;

    return () => {
      body.style.overflow = prevOverflow;
      body.style.paddingRight = prevPadding;
      restoreFocusRef.current?.focus?.();
    };
  }, [paletteOpen]);

  const groups = useMemo<Group[]>(() => {
    const trimmed = query.trim();

    /* Empty state. Not a blank panel: the most severe findings and the page's
       sections are the two things a user is most likely to want, so the
       palette opens already useful. */
    if (trimmed === "") {
      const result: Group[] = [];

      const recent = recentIds
        .map((id) => findings.find((f) => f.id === id))
        .filter((f): f is UnifiedFinding => f !== undefined);

      if (recent.length > 0) {
        result.push({
          heading: "Recent",
          items: recent.map((f) => ({ kind: "finding" as const, id: f.id, finding: f })),
        });
      }

      const suggested = [...findings]
        .sort((a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity])
        .filter((f) => !recentIds.includes(f.id))
        .slice(0, 5);

      if (suggested.length > 0) {
        result.push({
          heading: "Most severe",
          items: suggested.map((f) => ({ kind: "finding" as const, id: f.id, finding: f })),
        });
      }

      if (sections.length > 0) {
        result.push({
          heading: "Go to",
          items: sections.map((s) => ({
            kind: "section" as const,
            id: s.id,
            label: s.label,
            icon: s.icon,
            hint: s.count !== undefined ? `${s.count}` : undefined,
          })),
        });
      }

      return result;
    }

    const q = trimmed.toLowerCase();

    const matchedFindings = findings
      .map((f) => ({ f, s: score(f, q) }))
      .filter((x): x is { f: UnifiedFinding; s: number } => x.s !== null)
      .sort((a, b) => b.s - a.s || SEVERITY_ORDER[a.f.severity] - SEVERITY_ORDER[b.f.severity])
      .map(({ f }) => ({ kind: "finding" as const, id: f.id, finding: f }));

    const matchedSections = sections
      .filter((s) => s.label.toLowerCase().includes(q))
      .map((s) => ({ kind: "section" as const, id: s.id, label: s.label, icon: s.icon }));

    const result: Group[] = [];
    if (matchedFindings.length > 0) {
      result.push({ heading: `Findings (${matchedFindings.length})`, items: matchedFindings });
    }
    if (matchedSections.length > 0) {
      result.push({ heading: "Sections", items: matchedSections });
    }
    return result;
  }, [query, findings, sections, recentIds]);

  /* One flat list behind the visual grouping — arrow keys must cross group
     boundaries as if the headings were not there. */
  const flatItems = useMemo(() => groups.flatMap((g) => g.items), [groups]);

  useEffect(() => setActiveIndex(0), [query]);

  const runItem = useCallback(
    (item: Item) => {
      setPaletteOpen(false);

      if (item.kind === "section") {
        goToSection(item.id);
        return;
      }

      try {
        const next = [item.id, ...readRecents().filter((id) => id !== item.id)].slice(0, MAX_RECENTS);
        window.localStorage.setItem(RECENTS_KEY, JSON.stringify(next));
      } catch {
        /* Recents are a convenience; a storage failure must not block the jump. */
      }
      focusFinding(item.id);
    },
    [setPaletteOpen, goToSection, focusFinding],
  );

  function onKeyDown(event: React.KeyboardEvent) {
    if (event.key === "Escape") {
      event.preventDefault();
      setPaletteOpen(false);
      return;
    }
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActiveIndex((i) => (flatItems.length === 0 ? 0 : (i + 1) % flatItems.length));
      return;
    }
    if (event.key === "ArrowUp") {
      event.preventDefault();
      setActiveIndex((i) =>
        flatItems.length === 0 ? 0 : (i - 1 + flatItems.length) % flatItems.length,
      );
      return;
    }
    if (event.key === "Home") {
      event.preventDefault();
      setActiveIndex(0);
      return;
    }
    if (event.key === "End") {
      event.preventDefault();
      setActiveIndex(Math.max(0, flatItems.length - 1));
      return;
    }
    if (event.key === "Enter") {
      event.preventDefault();
      const item = flatItems[activeIndex];
      if (item) runItem(item);
      return;
    }
    /* The input is the only focusable element in the dialog, so Tab has
       nowhere legitimate to go. Swallowing it keeps focus from escaping to the
       page behind — the cheapest correct focus trap for a single-control
       dialog. */
    if (event.key === "Tab") {
      event.preventDefault();
    }
  }

  /* Keeps the active option within the scroll viewport as arrows move it. */
  useEffect(() => {
    if (!paletteOpen) return;
    const el = listRef.current?.querySelector<HTMLElement>('[data-active="true"]');
    el?.scrollIntoView({ block: "nearest" });
  }, [activeIndex, paletteOpen]);

  const activeId = flatItems[activeIndex]
    ? `palette-item-${flatItems[activeIndex].kind}-${flatItems[activeIndex].id}`
    : undefined;

  let renderIndex = -1;

  return (
    <AnimatePresence>
      {paletteOpen && (
        <motion.div
          className="fixed inset-0 z-[80] flex items-start justify-center px-4 pt-[10vh] sm:pt-[14vh]"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.15 }}
        >
          <div
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            onClick={() => setPaletteOpen(false)}
            aria-hidden="true"
          />

          <motion.div
            role="dialog"
            aria-modal="true"
            aria-label="Search findings and sections"
            initial={reduceMotion ? { opacity: 0 } : { opacity: 0, y: -8, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={reduceMotion ? { opacity: 0 } : { opacity: 0, y: -8, scale: 0.98 }}
            transition={{ duration: 0.18, ease: [0.22, 1, 0.36, 1] }}
            className="relative flex w-full max-w-xl flex-col overflow-hidden rounded-xl border border-line-strong bg-surface-raised shadow-lg"
            onKeyDown={onKeyDown}
          >
            <div className="flex items-center gap-2.5 border-b border-line px-4">
              <Icon name="search" size={17} className="text-fg-subtle" />
              <input
                ref={inputRef}
                autoFocus
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search by title, rule, file or category…"
                aria-label="Search findings and sections"
                role="combobox"
                aria-expanded="true"
                aria-controls="palette-list"
                aria-activedescendant={activeId}
                autoComplete="off"
                spellCheck={false}
                className="h-12 flex-1 bg-transparent text-base text-fg outline-none placeholder:text-fg-subtle"
              />
              <kbd className="hidden rounded border border-line bg-canvas px-1.5 py-0.5 font-mono text-2xs text-fg-subtle sm:inline">
                esc
              </kbd>
            </div>

            <ul
              ref={listRef}
              id="palette-list"
              role="listbox"
              aria-label="Results"
              className="max-h-[min(24rem,55vh)] overflow-y-auto overscroll-contain p-1.5"
            >
              {flatItems.length === 0 && (
                <li className="px-3 py-10 text-center">
                  <p className="text-sm font-medium text-fg">
                    {findings.length === 0
                      ? "Nothing to search yet"
                      : `No match for “${query.trim()}”`}
                  </p>
                  <p className="mt-1 text-xs text-fg-muted">
                    {findings.length === 0
                      ? "Scan a repository first — findings become searchable as soon as results arrive."
                      : "Try a rule id, a file path, or a severity such as “critical”."}
                  </p>
                </li>
              )}

              {groups.map((group) => (
                <li key={group.heading} role="presentation">
                  <p
                    role="presentation"
                    className="px-2.5 pt-2.5 pb-1 text-2xs font-semibold tracking-wider text-fg-subtle uppercase"
                  >
                    {group.heading}
                  </p>
                  <ul role="presentation">
                    {group.items.map((item) => {
                      renderIndex += 1;
                      const isActive = renderIndex === activeIndex;
                      return (
                        <PaletteRow
                          key={`${item.kind}-${item.id}`}
                          item={item}
                          isActive={isActive}
                          onSelect={() => runItem(item)}
                          onHover={() => setActiveIndex(flatItems.indexOf(item))}
                        />
                      );
                    })}
                  </ul>
                </li>
              ))}
            </ul>

            <div className="flex items-center gap-3 border-t border-line px-3 py-2 text-2xs text-fg-subtle">
              <LegendKey keys={["↑", "↓"]} label="navigate" />
              <LegendKey keys={["↵"]} label="jump" />
              <LegendKey keys={["esc"]} label="close" />
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

function LegendKey({ keys, label }: { keys: string[]; label: string }) {
  return (
    <span className="flex items-center gap-1">
      {keys.map((k) => (
        <kbd
          key={k}
          className="rounded border border-line bg-canvas px-1 py-0.5 font-mono text-[0.9em] text-fg-muted"
        >
          {k}
        </kbd>
      ))}
      {label}
    </span>
  );
}

function PaletteRow({
  item,
  isActive,
  onSelect,
  onHover,
}: {
  item: Item;
  isActive: boolean;
  onSelect: () => void;
  onHover: () => void;
}) {
  const id = `palette-item-${item.kind}-${item.id}`;

  if (item.kind === "section") {
    return (
      <li
        id={id}
        role="option"
        aria-selected={isActive}
        data-active={isActive}
        onClick={onSelect}
        onMouseMove={onHover}
        className={cn(
          "flex cursor-pointer items-center gap-2.5 rounded-md px-2.5 py-2 text-sm",
          isActive ? "bg-brand text-brand-fg" : "text-fg",
        )}
      >
        <Icon name={item.icon} size={15} className={isActive ? undefined : "text-fg-subtle"} />
        <span className="flex-1 truncate">{item.label}</span>
        <span className={cn("text-2xs", isActive ? "opacity-80" : "text-fg-subtle")}>section</span>
      </li>
    );
  }

  const { finding } = item;
  const sev = SEVERITY[finding.severity];

  return (
    <li
      id={id}
      role="option"
      aria-selected={isActive}
      data-active={isActive}
      onClick={onSelect}
      onMouseMove={onHover}
      className={cn(
        "flex cursor-pointer items-start gap-2.5 rounded-md px-2.5 py-2",
        isActive ? "bg-brand text-brand-fg" : "text-fg",
      )}
    >
      <Icon
        name={sev.icon}
        size={15}
        className={cn("mt-0.5", isActive ? undefined : sev.accent)}
      />
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="truncate text-sm font-medium">{finding.title}</span>
        <span
          className={cn(
            "flex items-center gap-1.5 truncate font-mono text-2xs",
            isActive ? "opacity-80" : "text-fg-subtle",
          )}
        >
          <Icon name={CATEGORY_ICON[finding.category]} size={11} />
          {finding.ruleId}
          <span aria-hidden="true">·</span>
          <span className="truncate">{finding.filePath}</span>
        </span>
      </span>
      <span
        className={cn(
          "shrink-0 text-2xs font-semibold tracking-wide uppercase",
          isActive ? "opacity-90" : sev.accent,
        )}
      >
        {sev.label}
      </span>
    </li>
  );
}
