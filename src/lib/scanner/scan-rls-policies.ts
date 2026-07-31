import type { RlsFinding, ScannedFile } from "./types";

const CREATE_POLICY_STATEMENT = /create\s+policy[\s\S]*?;/gi;
const POLICY_TABLE = /create\s+policy\s+(?:"[^"]*"|[A-Za-z0-9_]+)\s+on\s+"?([A-Za-z0-9_."]+)"?/i;
const POLICY_OPERATION = /\bfor\s+(all|select|insert|update|delete)\b/i;
const POLICY_ROLE = /\bto\s+([\s\S]+?)(?=\busing\s*\(|\bwith\s+check\s*\(|;|$)/i;
const USING_KEYWORD = /\busing\s*\(/i;

function lineNumberAt(content: string, index: number): number {
  let line = 1;
  for (let i = 0; i < index && i < content.length; i += 1) {
    if (content[i] === "\n") line += 1;
  }
  return line;
}

/**
 * Extracts the contents of the parenthesised group that opens at
 * `openParenIndex` (which must point at a "(" character), handling
 * nested parentheses. Returns null if the group never closes.
 */
function extractBalancedParenGroup(
  text: string,
  openParenIndex: number,
): { inner: string; endIndex: number } | null {
  let depth = 0;
  for (let i = openParenIndex; i < text.length; i += 1) {
    if (text[i] === "(") depth += 1;
    if (text[i] === ")") {
      depth -= 1;
      if (depth === 0) {
        return { inner: text.slice(openParenIndex + 1, i), endIndex: i };
      }
    }
  }
  return null;
}

function normaliseExpression(expression: string): string {
  let value = expression.trim();
  while (value.startsWith("(") && value.endsWith(")")) {
    const balanced = extractBalancedParenGroup(value, 0);
    if (balanced && balanced.endIndex === value.length - 1) {
      value = balanced.inner.trim();
    } else {
      break;
    }
  }
  return value;
}

function isAllowAllExpression(expression: string): boolean {
  return normaliseExpression(expression).toLowerCase() === "true";
}

function extractUsingClause(
  statement: string,
): { expression: string; offsetInStatement: number } | null {
  const keywordMatch = USING_KEYWORD.exec(statement);
  if (!keywordMatch) return null;

  const openParenIndex = keywordMatch.index + keywordMatch[0].length - 1;
  const group = extractBalancedParenGroup(statement, openParenIndex);
  if (!group) return null;

  return { expression: group.inner, offsetInStatement: openParenIndex };
}

function extractRole(statement: string): string | null {
  const match = POLICY_ROLE.exec(statement);
  if (!match) return null;
  const raw = match[1].trim().replace(/\s+/g, " ");
  return raw.length > 0 ? raw : null;
}

/**
 * Deterministically scans SQL migration/schema files for RLS policies
 * whose USING clause is the literal allow-all expression `true`. Only
 * text inside a `CREATE POLICY ... ;` statement's USING clause is ever
 * evaluated, so unrelated occurrences of the word "true" elsewhere in
 * the file (column defaults, comments, other expressions) are ignored.
 */
export function scanRlsPolicies(repository: string, files: ScannedFile[]): RlsFinding[] {
  const findings: RlsFinding[] = [];

  for (const file of files) {
    CREATE_POLICY_STATEMENT.lastIndex = 0;
    let match: RegExpExecArray | null;

    while ((match = CREATE_POLICY_STATEMENT.exec(file.content)) !== null) {
      const statement = match[0];
      const statementStart = match.index;

      const using = extractUsingClause(statement);
      if (!using || !isAllowAllExpression(using.expression)) {
        continue;
      }

      const tableMatch = POLICY_TABLE.exec(statement);
      const operationMatch = POLICY_OPERATION.exec(statement);
      const table = tableMatch ? tableMatch[1].replace(/"/g, "") : null;
      const operation = operationMatch ? operationMatch[1].toUpperCase() : null;
      const role = extractRole(statement);

      const absoluteIndex = statementStart + using.offsetInStatement;
      const line = lineNumberAt(file.content, absoluteIndex);

      findings.push({
        id: `RLS_ALLOW_ALL-${file.path}-${line}`,
        ruleId: "RLS_ALLOW_ALL",
        severity: "critical",
        title: table
          ? `Allow-all RLS policy on "${table}"`
          : "Allow-all RLS policy detected",
        repository,
        filePath: file.path,
        line,
        table,
        operation,
        role,
        evidence: statement.trim(),
        explanation:
          "This policy's USING clause is the literal boolean true, so PostgreSQL treats it as satisfied for every row regardless of who is asking. Row Level Security is effectively disabled: any client holding this role can read or modify every tenant's rows. Scope the expression to the requesting user instead, e.g. USING (auth.uid() = owner_id).",
      });
    }
  }

  return findings;
}
