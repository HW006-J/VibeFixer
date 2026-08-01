import type { ScannedFile } from "@/lib/scanner/types";

export type IamStatement = {
  index: number;
  sid: string | null;
  effect: string | null;
  action: string[];
  notAction: string[];
  resource: string[];
  notResource: string[];
  principal: string[];
  notPrincipal: string[];
  condition: Record<string, unknown> | null;
  raw: Record<string, unknown>;
};

export type ParsedIamDocument = {
  ok: true;
  version: string | null;
  statements: IamStatement[];
  filePath: string;
};

export type IamParseFailure = {
  ok: false;
  filePath: string;
  message: string;
};

export type IamParseResult = ParsedIamDocument | IamParseFailure;

function asStringArray(value: unknown): string[] {
  if (typeof value === "string") return [value];
  if (Array.isArray(value)) {
    return value.filter((item): item is string => typeof item === "string");
  }
  if (value && typeof value === "object") {
    const obj = value as Record<string, unknown>;
    const parts: string[] = [];
    for (const [key, nested] of Object.entries(obj)) {
      if (typeof nested === "string") {
        parts.push(`${key}:${nested}`);
      } else if (Array.isArray(nested)) {
        for (const item of nested) {
          if (typeof item === "string") parts.push(`${key}:${item}`);
        }
      }
    }
    return parts;
  }
  return [];
}

function parseStatement(raw: Record<string, unknown>, index: number): IamStatement {
  const sid = typeof raw.Sid === "string" ? raw.Sid : null;
  const effect = typeof raw.Effect === "string" ? raw.Effect : null;

  return {
    index,
    sid,
    effect,
    action: asStringArray(raw.Action),
    notAction: asStringArray(raw.NotAction),
    resource: asStringArray(raw.Resource),
    notResource: asStringArray(raw.NotResource),
    principal: asStringArray(raw.Principal),
    notPrincipal: asStringArray(raw.NotPrincipal),
    condition: raw.Condition && typeof raw.Condition === "object" ? (raw.Condition as Record<string, unknown>) : null,
    raw,
  };
}

function looksLikeIamDocument(parsed: unknown): boolean {
  if (!parsed || typeof parsed !== "object") return false;
  const doc = parsed as Record<string, unknown>;
  return "Statement" in doc || "statement" in doc;
}

/**
 * Parses AWS IAM policy JSON. Malformed or non-IAM JSON returns `{ ok: false }`
 * so callers can emit a safe needs-review finding instead of throwing.
 */
export function parseIamPolicyFile(file: ScannedFile): IamParseResult {
  let parsed: unknown;
  try {
    parsed = JSON.parse(file.content);
  } catch {
    return { ok: false, filePath: file.path, message: "File is not valid JSON." };
  }

  if (!looksLikeIamDocument(parsed)) {
    return { ok: false, filePath: file.path, message: "JSON does not look like an IAM policy document." };
  }

  const doc = parsed as Record<string, unknown>;
  const version = typeof doc.Version === "string" ? doc.Version : null;
  const statementRaw = doc.Statement ?? doc.statement;

  let statementsArray: unknown[];
  if (Array.isArray(statementRaw)) {
    statementsArray = statementRaw;
  } else if (statementRaw && typeof statementRaw === "object") {
    statementsArray = [statementRaw];
  } else {
    return { ok: false, filePath: file.path, message: "IAM policy is missing a Statement block." };
  }

  const statements: IamStatement[] = [];
  for (let i = 0; i < statementsArray.length; i++) {
    const item = statementsArray[i];
    if (!item || typeof item !== "object") {
      return { ok: false, filePath: file.path, message: `Statement at index ${i} is not an object.` };
    }
    statements.push(parseStatement(item as Record<string, unknown>, i));
  }

  return { ok: true, version, statements, filePath: file.path };
}

export function statementLabel(statement: IamStatement): string {
  if (statement.sid) return `Sid "${statement.sid}" (index ${statement.index})`;
  return `Statement index ${statement.index}`;
}

export function includesWildcardAction(actions: string[]): boolean {
  return actions.some((a) => a === "*" || a === "*:*");
}

export function includesWildcardResource(resources: string[]): boolean {
  return resources.some((r) => r === "*");
}

export function includesPublicPrincipal(principals: string[]): boolean {
  return principals.some((p) => p === "*" || p === "AWS:*" || p.endsWith(":*") && p.startsWith("AWS"));
}

const AWS_ACCOUNT_ID = /^\d{12}$/;

export function crossAccountPrincipalReferences(principals: string[]): string[] {
  const refs: string[] = [];
  for (const p of principals) {
    const normalised = p.replace(/^AWS:/, "");
    const arnMatch = /^arn:aws:iam::(\d{12}):/.exec(normalised);
    if (arnMatch) refs.push(arnMatch[1]);
    if (AWS_ACCOUNT_ID.test(normalised)) refs.push(normalised);
  }
  return refs;
}

export function hasRestrictiveCondition(condition: Record<string, unknown> | null): boolean {
  if (!condition) return false;
  const keys = Object.keys(condition);
  if (keys.length === 0) return false;
  const restrictiveHints = ["StringEquals", "StringLike", "IpAddress", "Bool", "DateGreaterThan", "ArnEquals"];
  return keys.some((k) => restrictiveHints.some((hint) => k.includes(hint)));
}
