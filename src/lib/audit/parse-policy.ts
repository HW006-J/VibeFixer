import type { SqlStatement } from "./discover-statements";
import { extractClauseExpression } from "./sql-expressions";
import { lineNumberAt } from "./source-location";

export type PolicyOperation = "ALL" | "SELECT" | "INSERT" | "UPDATE" | "DELETE";

export type ParsedPolicy = {
  name: string | null;
  table: string | null;
  operation: PolicyOperation | null;
  roles: string[];
  usingExpression: string | null;
  withCheckExpression: string | null;
  /** Line of the USING clause's opening paren, if present. */
  usingLine: number | null;
  /** Line of the WITH CHECK clause's opening paren, if present. */
  withCheckLine: number | null;
  /** Line of the CREATE POLICY statement itself. */
  line: number;
  filePath: string;
  evidence: string;
};

const CREATE_POLICY_KEYWORD_RE = /create\s+policy/i;
const POLICY_NAME_RE = /^create\s+policy\s+(?:"([^"]*)"|([A-Za-z0-9_]+))/i;
const POLICY_TABLE_RE = /create\s+policy\s+(?:"[^"]*"|[A-Za-z0-9_]+)\s+on\s+"?([A-Za-z0-9_."]+)"?/i;
const POLICY_OPERATION_RE = /\bfor\s+(all|select|insert|update|delete)\b/i;
const POLICY_ROLE_RE = /\bto\s+([\s\S]+?)(?=\busing\s*\(|\bwith\s+check\s*\(|;|$)/i;
const USING_KEYWORD_RE = /\busing\s*\(/i;
const WITH_CHECK_KEYWORD_RE = /\bwith\s+check\s*\(/i;

function extractName(statement: string): string | null {
  const match = POLICY_NAME_RE.exec(statement);
  if (!match) return null;
  return match[1] ?? match[2] ?? null;
}

function extractTable(statement: string): string | null {
  const match = POLICY_TABLE_RE.exec(statement);
  return match ? match[1].replace(/"/g, "") : null;
}

function extractOperation(statement: string): PolicyOperation | null {
  const match = POLICY_OPERATION_RE.exec(statement);
  return match ? (match[1].toUpperCase() as PolicyOperation) : null;
}

function extractRoles(statement: string): string[] {
  const match = POLICY_ROLE_RE.exec(statement);
  if (!match) return [];
  return match[1]
    .split(",")
    .map((role) => role.trim().replace(/^"|"$/g, "").replace(/\s+/g, " "))
    .filter((role) => role.length > 0);
}

/**
 * Parses a single `CREATE POLICY ... ;` statement into a structured record:
 * name, table, operation, roles, and the raw USING / WITH CHECK expressions
 * (if present), each with their own source line for precise evidence.
 */
export function parsePolicyStatement(
  statement: SqlStatement,
  fileContent: string,
  filePath: string,
): ParsedPolicy {
  const { raw } = statement;

  // The statement splitter includes any leading comment with no semicolon
  // boundary before "CREATE POLICY" as part of `raw` (a very common style
  // in real migrations). Extraction must start at the actual keyword, or
  // comment prose can collide with keyword regexes (e.g. a comment
  // containing the word "to" matching the TO-role pattern).
  const keywordMatch = CREATE_POLICY_KEYWORD_RE.exec(raw);
  const policyOffset = keywordMatch ? keywordMatch.index : 0;
  const body = raw.slice(policyOffset);

  const using = extractClauseExpression(body, USING_KEYWORD_RE);
  const withCheck = extractClauseExpression(body, WITH_CHECK_KEYWORD_RE);

  return {
    name: extractName(body),
    table: extractTable(body),
    operation: extractOperation(body),
    roles: extractRoles(body),
    usingExpression: using?.expression ?? null,
    withCheckExpression: withCheck?.expression ?? null,
    usingLine: using
      ? lineNumberAt(fileContent, statement.startIndex + policyOffset + using.offsetInStatement)
      : null,
    withCheckLine: withCheck
      ? lineNumberAt(fileContent, statement.startIndex + policyOffset + withCheck.offsetInStatement)
      : null,
    line: lineNumberAt(fileContent, statement.startIndex + policyOffset),
    filePath,
    evidence: body.trim(),
  };
}
