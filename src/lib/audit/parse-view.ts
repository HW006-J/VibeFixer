import type { SqlStatement } from "./discover-statements";
import { lineNumberAt } from "./source-location";

export type ParsedView = {
  name: string | null;
  /** True when the statement explicitly sets security_invoker = true (or on/1) in its WITH (...) options. */
  securityInvoker: boolean;
  /** Best-effort, regex-based table references from the view's SELECT body — not a full SQL parser. */
  referencedTables: string[];
  filePath: string;
  line: number;
  endLine: number;
  evidence: string;
};

const VIEW_NAME_RE = /^create\s+(?:or\s+replace\s+)?view\s+"?([A-Za-z0-9_."]+)"?/i;

/** Leading `-- line` and block comments, plus surrounding whitespace. */
const LEADING_COMMENTS_RE = /^(?:\s|--[^\n]*\n|\/\*[\s\S]*?\*\/)+/;

/**
 * Strips comments and whitespace preceding the statement so the anchored
 * name pattern above sees the CREATE VIEW itself.
 *
 * Statements arrive with any preceding comment block attached, and a
 * commented view is the normal case in hand-written migrations — the
 * anchor previously failed on all of them, so the finding could not name
 * the view it was about. Stripping only the *leading* run keeps the anchor,
 * which is what stops a `-- create view public.decoy` comment from being
 * mistaken for the real statement.
 */
function withoutLeadingComments(raw: string): string {
  return raw.replace(LEADING_COMMENTS_RE, "");
}
const SECURITY_INVOKER_RE = /security_invoker\s*=\s*(true|on|1)\b/i;
const TABLE_REFERENCE_RE = /\b(?:from|join)\s+"?([A-Za-z_][A-Za-z0-9_."]*)"?/gi;

/**
 * Parses a single `CREATE [OR REPLACE] VIEW ... ;` statement for just the
 * facts VIBE_SECURITY_DEFINER_VIEW needs: the view's name, whether it
 * opts into security_invoker, and which tables its body appears to
 * reference. Table-reference extraction is a best-effort regex scan for
 * `FROM`/`JOIN` targets, not a real SQL parser — it can miss subqueries,
 * CTEs, or unusually formatted SQL.
 */
export function parseViewStatement(statement: SqlStatement, fileContent: string, filePath: string): ParsedView {
  const { raw } = statement;

  const nameMatch = VIEW_NAME_RE.exec(withoutLeadingComments(raw));

  const referencedTables = new Set<string>();
  let match: RegExpExecArray | null;
  const tableRe = new RegExp(TABLE_REFERENCE_RE);
  while ((match = tableRe.exec(raw)) !== null) {
    referencedTables.add(match[1].replace(/"/g, "").toLowerCase());
  }

  return {
    name: nameMatch ? nameMatch[1].replace(/"/g, "") : null,
    securityInvoker: SECURITY_INVOKER_RE.test(raw),
    referencedTables: Array.from(referencedTables),
    filePath,
    line: lineNumberAt(fileContent, statement.startIndex),
    endLine: lineNumberAt(fileContent, statement.startIndex + raw.length),
    evidence: raw,
  };
}
