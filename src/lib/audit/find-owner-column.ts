import { extractBalancedParenGroup } from "./sql-expressions";

const REFERENCES_AUTH_USERS_RE = /references\s+auth\.users\s*\(/i;
const COLUMN_NAME_RE = /^"?([A-Za-z_][A-Za-z0-9_]*)"?\s/;

/** Splits a column-definition list on top-level commas only, so a comma inside e.g. `default gen_random_uuid()` doesn't split a single column definition in two. */
function splitTopLevelCommas(text: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let current = "";
  for (const char of text) {
    if (char === "(") depth += 1;
    if (char === ")") depth -= 1;
    if (char === "," && depth === 0) {
      parts.push(current);
      current = "";
    } else {
      current += char;
    }
  }
  if (current.trim().length > 0) parts.push(current);
  return parts;
}

/**
 * Finds the one column in a CREATE TABLE statement that has an inline
 * `references auth.users(...)` foreign key — the standard Supabase
 * convention for "this column identifies the owning user" — and returns
 * its name. This is real, parsed schema evidence, not a guess: it never
 * invents a column name, and only recognises the common inline
 * column-level FK form (not table-level `FOREIGN KEY (...) REFERENCES`
 * constraints, which this scanner does not parse). Returns null whenever
 * no such column is confidently found, so callers must fall back to a
 * generic, non-table-specific example rather than inventing one.
 */
export function findOwnerColumnHint(createTableStatement: string): string | null {
  const openParenIndex = createTableStatement.indexOf("(");
  if (openParenIndex === -1) return null;

  const group = extractBalancedParenGroup(createTableStatement, openParenIndex);
  if (!group) return null;

  for (const segment of splitTopLevelCommas(group.inner)) {
    const trimmed = segment.trim();
    if (!REFERENCES_AUTH_USERS_RE.test(trimmed)) continue;

    const nameMatch = COLUMN_NAME_RE.exec(trimmed);
    if (nameMatch) return nameMatch[1];
  }

  return null;
}
