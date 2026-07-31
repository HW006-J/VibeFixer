import { normaliseExpression } from "./sql-expressions";

/**
 * PostgreSQL applies a policy's `TO <role list>` clause literally, but when
 * it is omitted entirely, the policy applies to PUBLIC — i.e. every role,
 * including unauthenticated `anon` requests through Supabase's Data API.
 * This classifies a policy's role list for that specific exposure question,
 * not general role handling.
 */
export function classifyRoleExposure(roles: string[]): "public_exposed" | "restricted" {
  if (roles.length === 0) return "public_exposed";
  const normalised = roles.map((role) => role.trim().toLowerCase());
  if (normalised.some((role) => role === "public" || role === "anon")) return "public_exposed";
  return "restricted";
}

const LOGIN_ONLY_PATTERNS: RegExp[] = [
  /^auth\.uid\(\)\s+is\s+not\s+null$/,
  /^\(select\s+auth\.uid\(\)\)\s+is\s+not\s+null$/,
  /^auth\.role\(\)\s*=\s*'authenticated'(::text)?$/,
  /^auth\.jwt\(\)\s+is\s+not\s+null$/,
];

/**
 * Recognises a small, well-known set of expressions whose entire meaningful
 * protection is "the requester is logged in" — with no comparison that
 * binds the row to that specific requester. Deliberately narrow: only
 * matches when this is the *whole* expression (after stripping redundant
 * parens), so a larger expression that also contains a real ownership
 * check (e.g. `auth.uid() is not null and auth.uid() = owner_id`) is never
 * matched here.
 */
export function isLoginOnlyExpression(expression: string): boolean {
  const normalised = normaliseExpression(expression).toLowerCase().replace(/\s+/g, " ").trim();
  return LOGIN_ONLY_PATTERNS.some((pattern) => pattern.test(normalised));
}

const NON_NULL_OWNER_RE = /^"?([a-z_][a-z0-9_]*)"?\s+is\s+not\s+null$/i;

/**
 * Recognises a policy whose entire expression is a single column's
 * `IS NOT NULL` check (e.g. `trainer_id is not null`, `owner_id is not
 * null`). This proves the row *has* an owner column populated, but proves
 * nothing about whether the requester *is* that owner — a materially
 * different, much weaker guarantee than a real ownership comparison.
 */
export function isNonNullOwnerOnlyExpression(expression: string): { matches: boolean; column: string | null } {
  const normalised = normaliseExpression(expression).toLowerCase().replace(/\s+/g, " ").trim();
  const match = NON_NULL_OWNER_RE.exec(normalised);
  return match ? { matches: true, column: match[1] } : { matches: false, column: null };
}

/**
 * Recognises an access-control expression that relies on user-editable
 * metadata — `raw_user_meta_data`, `user_metadata`, or a JWT path reaching
 * into either — as part of the actual authorization decision (a
 * comparison, IN-list, or JSON extraction), not merely present somewhere
 * unrelated. Never matches `app_metadata` (trusted, not user-editable) or
 * a bare `auth.jwt()` call with no metadata access. Returns `confidence:
 * "medium"` rather than "high" when the metadata check is combined with
 * other AND/OR logic, since the overall risk then depends on how it
 * combines — a judgment call better left to human/semantic review.
 */
export function classifyUserMetadataAuthorization(
  expression: string,
): { matches: true; confidence: "high" | "medium" } | { matches: false; confidence: null } {
  const normalised = normaliseExpression(expression).toLowerCase().replace(/\s+/g, " ").trim();
  const referencesUserMetadata = /raw_user_meta_data|user_metadata/.test(normalised);
  if (!referencesUserMetadata) return { matches: false, confidence: null };

  const usedInAccessDecision = /[=<>]|\bin\b|->>?/.test(normalised);
  if (!usedInAccessDecision) return { matches: false, confidence: null };

  const combinedWithOtherLogic = /\band\b|\bor\b/.test(normalised);
  return { matches: true, confidence: combinedWithOtherLogic ? "medium" : "high" };
}
