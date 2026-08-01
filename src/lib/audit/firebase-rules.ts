import { makeFinding } from "./make-finding";
import { lineNumberAt } from "./source-location";
import type { AuditFinding } from "./types";
import type { ScannedFile } from "../scanner/types";

/**
 * Analyses a Firebase Realtime Database rules file.
 *
 * This exists because a vibe-coded app's access policy is rarely in only
 * one place. The same conceptual mistakes the SQL rules catch — a literal
 * allow-all, and "authenticated" mistaken for "authorized" — appear here in
 * a second policy language, and a finding is no less real for being written
 * in JSON instead of SQL.
 *
 * Static only: nothing here can be proven by execution the way the RLS leak
 * can, so every finding leaves liveValidationAvailable false (the default
 * in makeFinding).
 */

const ACCESS_KEYS = [".read", ".write"] as const;

type RulesNode = { [key: string]: unknown };

function isObject(value: unknown): value is RulesNode {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Locates the line of `key` within the node at `path` by walking the raw
 * text forward through each path segment in turn. Parsing discards
 * positions, and every finding in this project must cite a real line, so
 * the position is recovered from the source rather than approximated.
 *
 * Returns 1 when the location cannot be recovered — a wrong line is worse
 * than an unhelpful one, but a finding is never dropped over it.
 */
function locate(content: string, path: string[], key: string): number {
  let index = 0;

  for (const segment of path) {
    const found = content.indexOf(`"${segment}"`, index);
    if (found === -1) return 1;
    index = found + segment.length + 2;
  }

  const keyIndex = content.indexOf(`"${key}"`, index);
  return keyIndex === -1 ? 1 : lineNumberAt(content, keyIndex);
}

/** A node's path rendered the way Firebase documents it, e.g. `rules/push_tokens/$uid`. */
function renderPath(path: string[]): string {
  return path.join("/");
}

function publicRuleFinding(
  file: ScannedFile,
  repository: string,
  content: string,
  path: string[],
  key: string,
): AuditFinding {
  const location = renderPath(path);
  const operation = key === ".read" ? "read" : "write";

  return makeFinding({
    id: `firebase-public-${operation}-${location.replace(/[^a-z0-9]+/gi, "-")}`,
    ruleId: "VIBE_FIREBASE_PUBLIC_RULE",
    tier: "critical",
    confidence: "high",
    title: `Firebase rule at "${location}" grants ${operation} access to everyone`,
    repository,
    filePath: file.path,
    line: locate(content, path, key),
    objectType: "config",
    operation,
    evidence: `${location}: "${key}": true`,
    explanation:
      `This rule sets "${key}" to literal true, which means anyone on the internet can ` +
      `${operation} this data without signing in. Firebase rules cascade: everything beneath ` +
      `"${location}" inherits this permission, and no rule nested deeper can take it away.`,
    remediation:
      `Replace true with a condition that identifies who may ${operation} the data, such as ` +
      `comparing auth.uid against the key that owns the record. If this data really is public, ` +
      `move it to a path that contains nothing else.`,
    assumptions:
      "Assumes this rules file is the one deployed to the live Firebase project; the scanner reads the committed file and does not query Firebase.",
  });
}

/**
 * Matches a condition that establishes only that a request is signed in:
 * `auth != null`, `auth !== null`, `auth.uid != null`, and the reversed
 * operand order. Deliberately narrow — anything more complex is left alone
 * rather than guessed at.
 */
const AUTH_ONLY_CONDITION = /^\s*\(*\s*(?:null\s*!==?\s*auth(?:\.uid)?|auth(?:\.uid)?\s*!==?\s*null)\s*\)*\s*$/;

/** Firebase path variables are the segments beginning with `$`, e.g. `$uid`. */
function pathVariables(path: string[]): string[] {
  return path.filter((segment) => segment.startsWith("$"));
}

function authOnlyFinding(
  file: ScannedFile,
  repository: string,
  content: string,
  path: string[],
  key: string,
  condition: string,
  variables: string[],
): AuditFinding {
  const location = renderPath(path);
  const operation = key === ".read" ? "read" : "write";
  const variable = variables[variables.length - 1];

  return makeFinding({
    id: `firebase-auth-only-${operation}-${location.replace(/[^a-z0-9]+/gi, "-")}`,
    ruleId: "VIBE_FIREBASE_AUTH_ONLY_RULE",
    tier: "high",
    confidence: "high",
    title: `Firebase rule at "${location}" checks sign-in but not ownership`,
    repository,
    filePath: file.path,
    line: locate(content, path, key),
    objectType: "config",
    operation,
    evidence: `${location}: "${key}": "${condition}"`,
    explanation:
      `This rule only checks that the request comes from a signed-in user. It never compares ` +
      `auth.uid against ${variable}, the part of the path that says whose record this is, so ` +
      `any signed-in user can ${operation} every other user's data here. Being authenticated is ` +
      `not the same as being authorized.`,
    remediation:
      `Compare the caller against the record's owner, for example "auth.uid === ${variable}". ` +
      `Keep the sign-in check alongside it if you want both.`,
    assumptions:
      "Assumes this rules file is the one deployed to the live Firebase project; the scanner reads the committed file and does not query Firebase.",
  });
}

/** Recursively walks the rules tree, collecting findings in document order. */
function walk(
  node: RulesNode,
  path: string[],
  file: ScannedFile,
  repository: string,
  content: string,
  findings: AuditFinding[],
): void {
  const variables = pathVariables(path);

  for (const key of ACCESS_KEYS) {
    const value = node[key];

    if (value === true) {
      findings.push(publicRuleFinding(file, repository, content, path, key));
      continue;
    }

    // Only meaningful where the path itself names an owner. Without a path
    // variable there is nothing the condition could have compared against,
    // so "must be signed in" may well be the intended rule.
    if (typeof value === "string" && variables.length > 0 && AUTH_ONLY_CONDITION.test(value)) {
      findings.push(authOnlyFinding(file, repository, content, path, key, value, variables));
    }
  }

  for (const [key, value] of Object.entries(node)) {
    if (key.startsWith(".")) continue;
    if (isObject(value)) {
      walk(value, [...path, key], file, repository, content, findings);
    }
  }
}

export function analyzeFirebaseRules(file: ScannedFile, repository: string): AuditFinding[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(file.content);
  } catch {
    // Emitting nothing is the honest outcome. A rules file this scanner
    // cannot parse is not evidence that the rules are safe, and guessing at
    // its contents would violate the project's cite-or-say-nothing rule.
    return [];
  }

  if (!isObject(parsed) || !isObject(parsed.rules)) return [];

  const findings: AuditFinding[] = [];
  walk(parsed.rules, ["rules"], file, repository, file.content, findings);
  return findings;
}
