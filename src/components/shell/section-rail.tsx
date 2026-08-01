"use client";

import { motion, useReducedMotion } from "motion/react";
import { cn } from "@/components/ui/cn";
import { Icon } from "@/components/ui/icon";
import { useFindability } from "./findability-context";

/*
 * "You are here", for a page that has no URL to say it.
 *
 * This is the substitute for breadcrumbs. A breadcrumb trail communicates
 * depth, and there is no depth here — four sibling sections on one route. What
 * a reader actually needs is position within a long scroll, which is what a
 * scroll-spy rail gives: current section always visible, every other section
 * one click away, and no hierarchy implied that does not exist.
 *
 * The active marker is a shared layout element rather than four independently
 * animated underlines, so it slides between items and the movement itself
 * carries the "from here to there" information.
 */
export function SectionRail() {
  const { sections, activeSectionId, goToSection } = useFindability();
  const reduceMotion = useReducedMotion();

  if (sections.length === 0) return null;

  return (
    <nav
      aria-label="Page sections"
      /* Horizontally scrollable on narrow screens rather than wrapping to a
         second row — a wrapping rail changes the header's height as sections
         register, which shifts the whole page under the reader. */
      className="mx-auto w-full max-w-5xl overflow-x-auto px-4 [scrollbar-width:none] sm:px-6 [&::-webkit-scrollbar]:hidden"
    >
      <ul className="flex min-w-max items-center gap-1 pb-px">
        {sections.map((section) => {
          const isActive = section.id === activeSectionId;

          return (
            <li key={section.id}>
              <button
                type="button"
                onClick={() => goToSection(section.id)}
                /* `aria-current="location"` is the correct token for "this is
                   where you are in the page", as distinct from "step" or
                   "page". It is what makes the visual state above audible. */
                aria-current={isActive ? "location" : undefined}
                className={cn(
                  "relative flex h-11 cursor-pointer items-center gap-1.5 px-3 text-sm font-medium whitespace-nowrap",
                  "transition-colors duration-150",
                  isActive ? "text-fg" : "text-fg-subtle hover:text-fg",
                )}
              >
                <Icon name={section.icon} size={15} />
                {section.label}
                {section.count !== undefined && section.count > 0 && (
                  <span
                    className={cn(
                      "rounded-full px-1.5 py-0.5 text-2xs font-semibold tabular-nums transition-colors",
                      isActive ? "bg-brand text-brand-fg" : "bg-surface-hover text-fg-subtle",
                    )}
                  >
                    {section.count}
                  </span>
                )}

                {isActive && (
                  <motion.span
                    layoutId="section-rail-marker"
                    /* Disabling the transition rather than the element keeps
                       the marker present and correct under reduced motion —
                       it simply arrives instead of travelling. */
                    transition={
                      reduceMotion
                        ? { duration: 0 }
                        : { type: "spring", stiffness: 480, damping: 38 }
                    }
                    className="absolute inset-x-1.5 -bottom-px h-0.5 rounded-full bg-brand"
                  />
                )}
              </button>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
