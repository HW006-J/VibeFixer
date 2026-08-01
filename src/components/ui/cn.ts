/**
 * Joins class names, dropping anything falsy.
 *
 * Intentionally not `clsx` or `tailwind-merge`: this app needs conditional
 * joining and nothing else, and the components below are written so that
 * conflicting utilities never reach the same element in the first place —
 * which is what a merge library exists to paper over.
 */
export function cn(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(" ");
}
