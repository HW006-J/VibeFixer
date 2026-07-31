import type { SqlStatement } from "./discover-statements";
import { lineNumberAt } from "./source-location";

export type ParsedFunction = {
  name: string | null;
  securityDefiner: boolean;
  /** True only when an explicit SET search_path was found AND its value does not obviously include a mutable/writable schema like "public". */
  hasSafeExplicitSearchPath: boolean;
  /** True when a SET search_path clause was found at all, regardless of whether its value looks safe. */
  hasAnyExplicitSearchPath: boolean;
  filePath: string;
  line: number;
  endLine: number;
  evidence: string;
};

const FUNCTION_NAME_RE = /^create\s+(?:or\s+replace\s+)?function\s+"?([A-Za-z0-9_."]+)"?\s*\(/i;
const SECURITY_DEFINER_RE = /\bsecurity\s+definer\b/i;
const SEARCH_PATH_RE = /\bset\s+search_path\s*(?:=|to)\s*([^;]*)/i;

/**
 * Parses a single `CREATE [OR REPLACE] FUNCTION ... ;` statement for just
 * the facts VIBE_SECURITY_DEFINER_SEARCH_PATH needs: the function's name,
 * whether it's SECURITY DEFINER, and whether it sets an explicit,
 * apparently-safe search_path. Does not attempt to parse or validate the
 * function body itself (arbitrary PL/pgSQL is out of scope for a
 * deterministic static scanner).
 */
export function parseFunctionStatement(statement: SqlStatement, fileContent: string, filePath: string): ParsedFunction {
  const { raw } = statement;

  const nameMatch = FUNCTION_NAME_RE.exec(raw);
  const searchPathMatch = SEARCH_PATH_RE.exec(raw);
  const searchPathValue = searchPathMatch ? searchPathMatch[1].toLowerCase() : null;
  const searchPathLooksSafe = searchPathValue !== null && !searchPathValue.includes("public");

  return {
    name: nameMatch ? nameMatch[1].replace(/"/g, "") : null,
    securityDefiner: SECURITY_DEFINER_RE.test(raw),
    hasAnyExplicitSearchPath: searchPathMatch !== null,
    hasSafeExplicitSearchPath: searchPathMatch !== null && searchPathLooksSafe,
    filePath,
    line: lineNumberAt(fileContent, statement.startIndex),
    endLine: lineNumberAt(fileContent, statement.startIndex + raw.length),
    evidence: raw,
  };
}
