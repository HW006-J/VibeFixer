import type { ScannedFile } from "@/lib/scanner/types";
import { stableFindingId, type UnifiedFinding } from "../finding";
import {
  isPlaceholderValue,
  looksLikeHighEntropySecret,
  looksLikePrivateKeyBlock,
  redactSecretValue,
} from "./redact";

const ASSIGNMENT_PATTERNS: Array<{ ruleId: string; regex: RegExp; severity: UnifiedFinding["severity"] }> = [
  {
    ruleId: "SECRET_HARDCODED_API_KEY",
    regex: /\b(?:api[_-]?key|apikey|secret[_-]?key|access[_-]?token)\s*[:=]\s*['"]([^'"]{8,})['"]/gi,
    severity: "critical",
  },
  {
    ruleId: "SECRET_HARDCODED_PASSWORD",
    regex: /\b(?:password|passwd|pwd)\s*[:=]\s*['"]([^'"]{6,})['"]/gi,
    severity: "high",
  },
];

const NEXT_PUBLIC_PATTERN =
  /NEXT_PUBLIC_[A-Z0-9_]+\s*=\s*['"]([^'"]{12,})['"]/g;

const BEARER_PATTERN = /\bBearer\s+[A-Za-z0-9._-]{20,}/g;

function secretFinding(partial: Omit<UnifiedFinding, "category">): UnifiedFinding {
  return { category: "secret", ...partial };
}

function lineNumberAt(content: string, index: number): number {
  return content.slice(0, index).split("\n").length;
}

export function runSecretChecks(files: ScannedFile[]): UnifiedFinding[] {
  const findings: UnifiedFinding[] = [];

  for (const file of files) {
    if (file.path.toLowerCase().includes(".env")) continue;

    if (looksLikePrivateKeyBlock(file.content)) {
      const line = lineNumberAt(file.content, file.content.indexOf("-----BEGIN"));
      findings.push(
        secretFinding({
          id: stableFindingId(["secret", file.path, "PRIVATE_KEY", String(line)]),
          ruleId: "SECRET_PRIVATE_KEY",
          severity: "critical",
          confidence: "high",
          title: "Private key material appears in repository source",
          impact: "A PEM private key block was detected. Anyone with repository access could impersonate the associated identity.",
          recommendation: "Remove the key from source control, rotate credentials, and load keys from a secrets manager at runtime.",
          filePath: file.path,
          startLine: line,
          endLine: line,
          redactedEvidence: "-----BEGIN … PRIVATE KEY----- block present",
          assumptions: null,
          verification: "static",
        }),
      );
    }

    for (const { ruleId, regex, severity } of ASSIGNMENT_PATTERNS) {
      regex.lastIndex = 0;
      let match: RegExpExecArray | null;
      while ((match = regex.exec(file.content)) !== null) {
        const value = match[1];
        if (isPlaceholderValue(value)) continue;
        if (!looksLikeHighEntropySecret(value) && value.length < 20) continue;

        const line = lineNumberAt(file.content, match.index);
        findings.push(
          secretFinding({
            id: stableFindingId(["secret", file.path, ruleId, String(line)]),
            ruleId,
            severity,
            confidence: "high",
            title: "Hardcoded credential-like assignment in source",
            impact: "A secret-like value is assigned inline instead of using environment variables or a secrets manager.",
            recommendation: "Move the value to a server-side secret store and reference it via environment configuration.",
            filePath: file.path,
            startLine: line,
            endLine: line,
            redactedEvidence: redactSecretValue(value),
            assumptions: "Pattern-based detection only; confirm the value is live before rotating.",
            verification: "static",
          }),
        );
      }
    }

    NEXT_PUBLIC_PATTERN.lastIndex = 0;
    let pubMatch: RegExpExecArray | null;
    while ((pubMatch = NEXT_PUBLIC_PATTERN.exec(file.content)) !== null) {
      const value = pubMatch[1];
      const varName = /NEXT_PUBLIC_[A-Z0-9_]+/.exec(pubMatch[0])?.[0];
      if (isPlaceholderValue(value)) continue;
      if (!looksLikeHighEntropySecret(value)) {
        const line = lineNumberAt(file.content, pubMatch.index);
        findings.push(
          secretFinding({
            id: stableFindingId(["secret", file.path, "SECRET_NEXT_PUBLIC_REVIEW", String(line)]),
            ruleId: "SECRET_NEXT_PUBLIC_REVIEW",
            severity: "review",
            confidence: "low",
            title: "NEXT_PUBLIC variable may expose sensitive data to browsers",
            impact: `${varName ?? "NEXT_PUBLIC_*"} is bundled to client-side code. Verify this value is safe to expose publicly.`,
            recommendation: "Keep secrets server-side; use NEXT_PUBLIC only for non-sensitive configuration.",
            filePath: file.path,
            startLine: line,
            endLine: line,
            redactedEvidence: redactSecretValue(value, varName),
            assumptions: null,
            verification: "needs_review",
          }),
        );
        continue;
      }

      const line = lineNumberAt(file.content, pubMatch.index);
      findings.push(
        secretFinding({
          id: stableFindingId(["secret", file.path, "SECRET_NEXT_PUBLIC", String(line)]),
          ruleId: "SECRET_NEXT_PUBLIC",
          severity: "high",
          confidence: "high",
          title: "Secret-like value assigned to NEXT_PUBLIC variable",
          impact: `${varName ?? "NEXT_PUBLIC_*"} will be exposed in client bundles.`,
          recommendation: "Remove secrets from NEXT_PUBLIC variables; proxy sensitive operations through authenticated server routes.",
          filePath: file.path,
          startLine: line,
          endLine: line,
          redactedEvidence: redactSecretValue(value, varName),
          assumptions: null,
          verification: "static",
        }),
      );
    }

    BEARER_PATTERN.lastIndex = 0;
    let bearerMatch: RegExpExecArray | null;
    while ((bearerMatch = BEARER_PATTERN.exec(file.content)) !== null) {
      const token = bearerMatch[0].replace(/^Bearer\s+/, "");
      if (isPlaceholderValue(token)) continue;
      const line = lineNumberAt(file.content, bearerMatch.index);
      findings.push(
        secretFinding({
          id: stableFindingId(["secret", file.path, "SECRET_BEARER", String(line)]),
          ruleId: "SECRET_BEARER_TOKEN",
          severity: "high",
          confidence: "medium",
          title: "Bearer token literal in source file",
          impact: "Hardcoded bearer tokens in source can grant API access if the repository leaks.",
          recommendation: "Load tokens from secure runtime configuration and rotate if this value was ever committed.",
          filePath: file.path,
          startLine: line,
          endLine: line,
          redactedEvidence: redactSecretValue(token),
          assumptions: null,
          verification: "static",
        }),
      );
    }
  }

  return findings;
}
