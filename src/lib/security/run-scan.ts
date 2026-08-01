import type { AuditCoverage, AuditFinding, AuditReport } from "@/lib/audit/types";
import type { ScannedFile } from "@/lib/scanner/types";
import { runAudit } from "@/lib/audit/run-audit";
import { auditFindingsToUnified } from "./from-audit";
import { runEndpointChecks } from "./endpoints/run-endpoint-checks";
import { runIamChecks } from "./iam/run-iam-checks";
import { runSecretChecks } from "./secrets/run-secret-checks";
import { buildSecurityReport, type SecurityReport } from "./report";
import type { UnifiedFinding } from "./finding";

export const SECURITY_RULE_IDS = [
  "IAM_ALLOW_WILDCARD_ACTION",
  "IAM_ALLOW_WILDCARD_RESOURCE",
  "IAM_TRUST_PUBLIC_PRINCIPAL",
  "IAM_CROSS_ACCOUNT_TRUST",
  "IAM_SENSITIVE_BROAD_RESOURCE",
  "IAM_PRIVILEGED_MUTATION",
  "IAM_PASSROLE_ATTACH_COMBO",
  "IAM_MALFORMED_DOCUMENT",
  "SECRET_PRIVATE_KEY",
  "SECRET_HARDCODED_API_KEY",
  "SECRET_HARDCODED_PASSWORD",
  "SECRET_NEXT_PUBLIC",
  "SECRET_NEXT_PUBLIC_REVIEW",
  "SECRET_BEARER_TOKEN",
  "ENDPOINT_UNPROTECTED_SENSITIVE",
  "ENDPOINT_SENSITIVE_NEEDS_REVIEW",
] as const;

const SUPABASE_RULE_COUNT = 12;

function isSqlFile(path: string): boolean {
  return path.endsWith(".sql");
}

export type UnifiedScanResult = {
  repository: string;
  isDemoRepository: boolean;
  findings: AuditFinding[];
  unifiedFindings: UnifiedFinding[];
  securityReport: SecurityReport;
  coverage: AuditCoverage & {
    categoriesAssessed: string[];
    filesByCategory: Record<string, string[]>;
  };
  durationMs: number;
};

export async function runUnifiedSecurityScan(
  repository: string,
  isDemoRepository: boolean,
  files: ScannedFile[],
): Promise<UnifiedScanResult> {
  const startedAt = Date.now();
  const sqlFiles = files.filter((f) => isSqlFile(f.path));
  const auditReport: AuditReport = await runAudit(repository, isDemoRepository, sqlFiles);

  const iamFindings = runIamChecks(files);
  const secretFindings = runSecretChecks(files);
  const endpointFindings = runEndpointChecks(files);

  const unifiedFindings: UnifiedFinding[] = [
    ...auditFindingsToUnified(auditReport.findings),
    ...iamFindings,
    ...secretFindings,
    ...endpointFindings,
  ];

  const filesByCategory: Record<string, string[]> = {
    supabase: sqlFiles.map((f) => f.path),
    iam: files.filter((f) => f.path.toLowerCase().endsWith(".json")).map((f) => f.path),
    secret: files
      .filter((f) => !f.path.toLowerCase().includes(".env") && !isSqlFile(f.path))
      .map((f) => f.path),
    endpoint: files.filter((f) => /route\.(tsx?|jsx?)$/.test(f.path) || /pages\/api\//.test(f.path)).map((f) => f.path),
  };

  const categoriesAssessed = ["supabase", "iam", "secret", "endpoint"].filter(
    (cat) => (filesByCategory[cat]?.length ?? 0) > 0 || unifiedFindings.some((f) => f.category === cat),
  );

  const securityReport = buildSecurityReport({
    repository,
    filesInspected: files.map((f) => f.path),
    unifiedFindings,
    checksRun: SUPABASE_RULE_COUNT + SECURITY_RULE_IDS.length,
    categoriesAssessed,
    unsupportedContext: buildUnsupportedContext(files, sqlFiles),
  });

  const coverage = {
    ...auditReport.coverage,
    filesScanned: files.map((f) => f.path),
    categoriesAssessed,
    filesByCategory,
  };

  return {
    repository,
    isDemoRepository,
    findings: auditReport.findings,
    unifiedFindings,
    securityReport,
    coverage,
    durationMs: Date.now() - startedAt,
  };
}

function buildUnsupportedContext(allFiles: ScannedFile[], sqlFiles: ScannedFile[]): string[] {
  const notes: string[] = [];
  if (sqlFiles.length === 0) {
    notes.push("No Supabase SQL migrations were available; RLS rules did not run on schema SQL.");
  }
  if (!allFiles.some((f) => f.path.toLowerCase().endsWith(".json"))) {
    notes.push("No IAM JSON policy files were fetched; AWS IAM rules were not exercised on policy documents.");
  }
  if (!allFiles.some((f) => /route\.(tsx?|jsx?)$/.test(f.path))) {
    notes.push("No Next.js API route handlers were found under app/api or pages/api.");
  }
  notes.push("Effective cloud access depends on deployed IAM attachments and runtime secrets not visible in this static scan.");
  return notes;
}
