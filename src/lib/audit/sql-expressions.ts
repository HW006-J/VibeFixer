/**
 * Extracts the contents of the parenthesised group that opens at
 * `openParenIndex` (which must point at a "(" character), handling
 * nested parentheses. Returns null if the group never closes.
 */
export function extractBalancedParenGroup(
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

/** Trims an expression and strips any fully-redundant wrapping parentheses. */
export function normaliseExpression(expression: string): string {
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

export function isLiteralTrueExpression(expression: string): boolean {
  return normaliseExpression(expression).toLowerCase() === "true";
}

/**
 * Extracts the parenthesised expression that immediately follows `keyword`
 * (e.g. "using" or "with check") within `statement`, returning the raw
 * inner text and the absolute character offset of the opening paren.
 */
export function extractClauseExpression(
  statement: string,
  keywordPattern: RegExp,
): { expression: string; offsetInStatement: number } | null {
  const keywordMatch = keywordPattern.exec(statement);
  if (!keywordMatch) return null;

  const openParenIndex = keywordMatch.index + keywordMatch[0].length - 1;
  const group = extractBalancedParenGroup(statement, openParenIndex);
  if (!group) return null;

  return { expression: group.inner.trim(), offsetInStatement: openParenIndex };
}
