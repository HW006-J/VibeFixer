import type { ScannedFile } from "@/lib/scanner/types";
import { stableFindingId, type UnifiedFinding } from "../finding";

const ROUTE_FILE =
  /^(?:src\/)?(?:app\/api\/(?:.+\/)?route\.(?:ts|tsx|js|jsx)|pages\/api\/.+\.(?:ts|tsx|js|jsx))$/;

const SENSITIVE_PATH_SEGMENTS = [
  "admin",
  "export",
  "users",
  "billing",
  "secrets",
  "delete",
  "bulk",
  "migrate",
  "database",
  "internal",
];

const AUTH_SIGNALS = [
  /getUser\s*\(/,
  /auth\.getSession/,
  /getServerSession/,
  /verifySession/,
  /requireAuth/,
  /assertAdmin/,
  /checkRole/,
  /hasPermission/,
  /authorized/,
  /Authorization/,
  /Bearer/,
  /createRouteHandlerClient/,
  /createServerClient/,
  /supabase\.auth/,
  /cookies\s*\(\s*\)/,
  /headers\s*\(\s*\).*authorization/i,
  /middleware/i,
  /verifyToken/,
  /validateApiKey/,
];

function endpointFinding(partial: Omit<UnifiedFinding, "category">): UnifiedFinding {
  return { category: "endpoint", ...partial };
}

function routePathFromFile(filePath: string): string {
  const appMatch = /app\/api\/(.+)\/route\.(?:tsx?|jsx?)$/.exec(filePath);
  if (appMatch) return `/api/${appMatch[1]}`;
  const pagesMatch = /pages\/api\/(.+)\.(?:tsx?|jsx?)$/.exec(filePath);
  if (pagesMatch) return `/api/${pagesMatch[1]}`;
  return filePath;
}

function sensitiveSegments(routePath: string): string[] {
  const lower = routePath.toLowerCase();
  return SENSITIVE_PATH_SEGMENTS.filter((seg) => lower.includes(`/${seg}`) || lower.includes(`${seg}/`) || lower.endsWith(seg));
}

function hasAuthMechanism(content: string): boolean {
  return AUTH_SIGNALS.some((re) => re.test(content));
}

function performsMutation(content: string): boolean {
  return /\b(?:POST|PUT|PATCH|DELETE)\b/.test(content) || /\b(?:insert|update|delete|upsert)\s*\(/.test(content);
}

export function runEndpointChecks(files: ScannedFile[]): UnifiedFinding[] {
  const findings: UnifiedFinding[] = [];

  for (const file of files) {
    if (!ROUTE_FILE.test(file.path)) continue;

    const routePath = routePathFromFile(file.path);
    const segments = sensitiveSegments(routePath);
    if (segments.length === 0 && !performsMutation(file.content)) continue;

    const protectedRoute = hasAuthMechanism(file.content);
    const sensitive = segments.length > 0;
    const mutating = performsMutation(file.content);

    if (sensitive && mutating && !protectedRoute) {
      findings.push(
        endpointFinding({
          id: stableFindingId(["endpoint", file.path, "UNPROTECTED_SENSITIVE"]),
          ruleId: "ENDPOINT_UNPROTECTED_SENSITIVE",
          severity: "high",
          confidence: "high",
          title: `Sensitive API route lacks visible auth checks`,
          impact: `Route ${routePath} appears to handle sensitive segments (${segments.join(", ")}) or mutations without identifiable authentication in this file.`,
          recommendation: "Add explicit session or token verification before returning or mutating sensitive data.",
          filePath: file.path,
          startLine: 1,
          endLine: Math.max(1, file.content.split("\n").length),
          redactedEvidence: `Route path ${routePath}; no auth helper detected in file`,
          assumptions: "Protection may exist in shared middleware or parent layouts not visible in this file.",
          verification: "static",
        }),
      );
      continue;
    }

    if (sensitive && !protectedRoute) {
      findings.push(
        endpointFinding({
          id: stableFindingId(["endpoint", file.path, "SENSITIVE_REVIEW"]),
          ruleId: "ENDPOINT_SENSITIVE_NEEDS_REVIEW",
          severity: "review",
          confidence: "medium",
          title: `Sensitive-looking API route needs auth review`,
          impact: `Route ${routePath} includes sensitive path segments (${segments.join(", ")}). No auth pattern was detected in this file.`,
          recommendation: "Confirm authentication wraps this handler (middleware, wrapper, or upstream gateway).",
          filePath: file.path,
          startLine: 1,
          endLine: 1,
          redactedEvidence: `Route path ${routePath}`,
          assumptions: "Auth may be enforced outside this file.",
          verification: "needs_review",
        }),
      );
      continue;
    }

    if (sensitive && protectedRoute) {
      // No finding — protected sensitive route is expected safe static outcome
    }
  }

  return findings;
}

/** @internal for tests */
export const endpointTestHelpers = {
  routePathFromFile,
  hasAuthMechanism,
  sensitiveSegments,
};
