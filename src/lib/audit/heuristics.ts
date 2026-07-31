/**
 * A deliberately narrow heuristic for expressions that match a common
 * Supabase tenant-scoping pattern (comparing a column to the requesting
 * user's identity). Matching this pattern is NOT a safety guarantee — it
 * only means the scanner did not find grounds to flag it, so no finding is
 * raised for it. It is never presented to the user as "verified safe".
 */
export function looksLikeTenantScopingPattern(expression: string): boolean {
  const normalised = expression.toLowerCase().replace(/\s+/g, " ").trim();

  const referencesIdentity =
    normalised.includes("auth.uid()") ||
    normalised.includes("auth.jwt()") ||
    normalised.includes("current_setting(") ||
    normalised.includes("session_user") ||
    normalised.includes("current_user");

  if (!referencesIdentity) return false;

  // Require some kind of comparison so we don't treat e.g. a comment-only
  // reference or a bare function call as a scoping check. JSON path
  // operators (->, ->>) are stripped first since they contain ">" but are
  // not themselves a comparison — without this, any auth.jwt() path
  // expression (e.g. reaching into user-editable metadata) would look like
  // a comparison purely because of the arrow operator, even with no real
  // comparison anywhere in the expression.
  const withoutJsonPathOperators = normalised.replace(/->>?/g, " ");
  return /[=<>]|\bin\b/.test(withoutJsonPathOperators);
}
