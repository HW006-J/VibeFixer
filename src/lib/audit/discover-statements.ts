export type SqlStatementType =
  | "CREATE_TABLE"
  | "ALTER_TABLE_ENABLE_RLS"
  | "ALTER_TABLE_DISABLE_RLS"
  | "CREATE_POLICY"
  | "ALTER_POLICY"
  | "DROP_POLICY"
  | "OTHER";

export type SqlStatement = {
  type: SqlStatementType;
  /** The statement's raw text, including its trailing semicolon when present. */
  raw: string;
  /** Character offset of the statement's first non-whitespace character within the file. */
  startIndex: number;
};

/**
 * Splits SQL source into top-level statements, respecting single-quoted
 * string literals, double-quoted identifiers, and `--` / `/* *‌/` comments
 * so that semicolons or keywords inside a string or comment never split or
 * misclassify a statement. Does not handle dollar-quoted bodies (`$$...$$`)
 * since none of the constructs this scanner cares about (CREATE TABLE,
 * ALTER TABLE, CREATE/ALTER/DROP POLICY) use them.
 */
export function splitSqlStatements(content: string): SqlStatement[] {
  const statements: SqlStatement[] = [];
  let statementStart = 0;
  let i = 0;
  const length = content.length;

  while (i < length) {
    const char = content[i];

    // Line comment
    if (char === "-" && content[i + 1] === "-") {
      const newline = content.indexOf("\n", i);
      i = newline === -1 ? length : newline + 1;
      continue;
    }

    // Block comment
    if (char === "/" && content[i + 1] === "*") {
      const close = content.indexOf("*/", i + 2);
      i = close === -1 ? length : close + 2;
      continue;
    }

    // Single-quoted string literal ('' is an escaped quote)
    if (char === "'") {
      i += 1;
      while (i < length) {
        if (content[i] === "'" && content[i + 1] === "'") {
          i += 2;
          continue;
        }
        if (content[i] === "'") {
          i += 1;
          break;
        }
        i += 1;
      }
      continue;
    }

    // Double-quoted identifier ("" is an escaped quote)
    if (char === '"') {
      i += 1;
      while (i < length) {
        if (content[i] === '"' && content[i + 1] === '"') {
          i += 2;
          continue;
        }
        if (content[i] === '"') {
          i += 1;
          break;
        }
        i += 1;
      }
      continue;
    }

    if (char === ";") {
      const raw = content.slice(statementStart, i + 1);
      pushStatement(statements, raw, statementStart);
      i += 1;
      statementStart = i;
      continue;
    }

    i += 1;
  }

  // Trailing statement with no terminating semicolon.
  const trailing = content.slice(statementStart);
  if (trailing.trim().length > 0) {
    pushStatement(statements, trailing, statementStart);
  }

  return statements;
}

function pushStatement(statements: SqlStatement[], raw: string, blockStart: number) {
  const leadingWhitespace = raw.length - raw.trimStart().length;
  const trimmed = raw.trim();
  if (trimmed.length === 0) return;

  statements.push({
    type: classifyStatement(trimmed),
    raw: trimmed,
    startIndex: blockStart + leadingWhitespace,
  });
}

const CREATE_TABLE_RE = /^create\s+table\b/i;
const ALTER_TABLE_ENABLE_RLS_RE = /^alter\s+table\b[\s\S]*\benable\s+row\s+level\s+security\b/i;
const ALTER_TABLE_DISABLE_RLS_RE = /^alter\s+table\b[\s\S]*\bdisable\s+row\s+level\s+security\b/i;
const CREATE_POLICY_RE = /^create\s+policy\b/i;
const ALTER_POLICY_RE = /^alter\s+policy\b/i;
const DROP_POLICY_RE = /^drop\s+policy\b/i;

/** Strips leading whitespace, `-- ...` line comments, and `/* ... *‌/` block comments so classification regexes see the first real keyword. */
function stripLeadingTrivia(text: string): string {
  let value = text;
  while (true) {
    const withoutWhitespace = value.replace(/^\s+/, "");
    if (withoutWhitespace.startsWith("--")) {
      const newline = withoutWhitespace.indexOf("\n");
      value = newline === -1 ? "" : withoutWhitespace.slice(newline + 1);
      continue;
    }
    if (withoutWhitespace.startsWith("/*")) {
      const close = withoutWhitespace.indexOf("*/");
      value = close === -1 ? "" : withoutWhitespace.slice(close + 2);
      continue;
    }
    return withoutWhitespace;
  }
}

function classifyStatement(statement: string): SqlStatementType {
  const stripped = stripLeadingTrivia(statement);
  if (CREATE_POLICY_RE.test(stripped)) return "CREATE_POLICY";
  if (ALTER_POLICY_RE.test(stripped)) return "ALTER_POLICY";
  if (DROP_POLICY_RE.test(stripped)) return "DROP_POLICY";
  if (ALTER_TABLE_ENABLE_RLS_RE.test(stripped)) return "ALTER_TABLE_ENABLE_RLS";
  if (ALTER_TABLE_DISABLE_RLS_RE.test(stripped)) return "ALTER_TABLE_DISABLE_RLS";
  if (CREATE_TABLE_RE.test(stripped)) return "CREATE_TABLE";
  return "OTHER";
}
