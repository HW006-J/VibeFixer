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

  const nameMatch = VIEW_NAME_RE.exec(raw);

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
