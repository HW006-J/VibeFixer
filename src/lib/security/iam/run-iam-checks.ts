import type { ScannedFile } from "@/lib/scanner/types";
import {
  crossAccountPrincipalReferences,
  hasRestrictiveCondition,
  includesPublicPrincipal,
  includesWildcardAction,
  includesWildcardResource,
  parseIamPolicyFile,
  statementLabel,
  type IamStatement,
  type ParsedIamDocument,
} from "./parse-iam";
import { stableFindingId, type UnifiedFinding } from "../finding";

const SENSITIVE_IAM_MUTATIONS = [
  "iam:CreatePolicy",
  "iam:AttachUserPolicy",
  "iam:AttachRolePolicy",
  "iam:AttachGroupPolicy",
  "iam:PutRolePolicy",
  "iam:CreateAccessKey",
];

const PRIV_ESCALATION_PAIRS = [
  { pass: "iam:PassRole", attach: "iam:AttachRolePolicy" },
  { pass: "iam:PassRole", attach: "iam:PutRolePolicy" },
];

function iamFinding(partial: Omit<UnifiedFinding, "category">): UnifiedFinding {
  return { category: "iam", ...partial };
}

function statementRef(filePath: string, statement: IamStatement): string {
  const sidPart = statement.sid ?? `idx${statement.index}`;
  return stableFindingId(["iam", filePath, sidPart]);
}

function redactStatementSnippet(statement: IamStatement): string {
  const effect = statement.effect ?? "unknown";
  const actions = statement.action.length > 0 ? statement.action.slice(0, 3).join(", ") : "(none listed)";
  return `Effect=${effect}; Action=[${actions}]`;
}

function runRulesOnDocument(doc: ParsedIamDocument): UnifiedFinding[] {
  const findings: UnifiedFinding[] = [];
  const { filePath, statements } = doc;

  for (const statement of statements) {
    const isAllow = statement.effect?.toLowerCase() === "allow";
    const label = statementLabel(statement);
    const baseId = statementRef(filePath, statement);
    const evidence = redactStatementSnippet(statement);

    if (isAllow && includesWildcardAction(statement.action)) {
      findings.push(
        iamFinding({
          id: stableFindingId([baseId, "IAM_ALLOW_WILDCARD_ACTION"]),
          ruleId: "IAM_ALLOW_WILDCARD_ACTION",
          severity: "critical",
          confidence: "high",
          title: `IAM Allow statement grants Action "*"`,
          impact: `${label} in ${filePath} allows any AWS API action. Effective access still depends on identity attachment and other policies, which this scan cannot see.`,
          recommendation:
            "Replace Action \"*\" with the smallest set of service actions required, scoped per workload.",
          filePath,
          startLine: 1,
          endLine: 1,
          redactedEvidence: evidence,
          assumptions:
            "Assumes this JSON is used as an IAM identity or resource policy in AWS. Attachment to users, roles, or groups is unknown.",
          verification: "static",
        }),
      );
    }

    if (isAllow && includesWildcardResource(statement.resource)) {
      findings.push(
        iamFinding({
          id: stableFindingId([baseId, "IAM_ALLOW_WILDCARD_RESOURCE"]),
          ruleId: "IAM_ALLOW_WILDCARD_RESOURCE",
          severity: "critical",
          confidence: "high",
          title: `IAM Allow statement targets Resource "*"`,
          impact: `${label} applies to all resources matching the action. Without additional conditions, this is a common path to account-wide data exposure.`,
          recommendation: "Scope Resource ARNs to specific buckets, tables, or prefixes required by the workload.",
          filePath,
          startLine: 1,
          endLine: 1,
          redactedEvidence: evidence,
          assumptions: "Assumes this policy document is attached or assumable in AWS; attachment context is unknown.",
          verification: "static",
        }),
      );
    }

    if (statement.principal.length > 0 && includesPublicPrincipal(statement.principal)) {
      findings.push(
        iamFinding({
          id: stableFindingId([baseId, "IAM_TRUST_PUBLIC_PRINCIPAL"]),
          ruleId: "IAM_TRUST_PUBLIC_PRINCIPAL",
          severity: "critical",
          confidence: "high",
          title: `IAM trust policy allows Principal "*"`,
          impact: `${label} trusts any AWS principal. Cross-account and anonymous effective access depends on how the role is exposed; treat this as high-risk trust configuration.`,
          recommendation: "Restrict Principal to specific AWS account IDs, IAM ARNs, or federated identities.",
          filePath,
          startLine: 1,
          endLine: 1,
          redactedEvidence: `Principal includes wildcard; ${evidence}`,
          assumptions: "Assumes this document is a role trust policy or resource policy with a Principal element.",
          verification: "static",
        }),
      );
    }

    const crossAccounts = crossAccountPrincipalReferences(statement.principal);
    if (crossAccounts.length > 0 && !includesPublicPrincipal(statement.principal)) {
      findings.push(
        iamFinding({
          id: stableFindingId([baseId, "IAM_CROSS_ACCOUNT_TRUST"]),
          ruleId: "IAM_CROSS_ACCOUNT_TRUST",
          severity: "high",
          confidence: "medium",
          title: `IAM trust references another AWS account`,
          impact: `${label} references account ID(s) ${crossAccounts.join(", ")}. Verify this cross-account trust is intentional and constrained with external ID or conditions.`,
          recommendation: "Add condition keys (sts:ExternalId, source ARN) and document approved partner accounts.",
          filePath,
          startLine: 1,
          endLine: 1,
          redactedEvidence: `Principal references account(s) ${crossAccounts.join(", ")}`,
          assumptions: "Assumes Principal ARNs refer to real cross-account trust; effective assume-role paths are not verified.",
          verification: "static",
        }),
      );
    }

    const sensitiveOnBroad =
      isAllow &&
      statement.action.some((a) => a.startsWith("s3:") || a.startsWith("dynamodb:") || a.startsWith("secretsmanager:")) &&
      (includesWildcardResource(statement.resource) || statement.resource.length === 0) &&
      !hasRestrictiveCondition(statement.condition);

    if (sensitiveOnBroad) {
      findings.push(
        iamFinding({
          id: stableFindingId([baseId, "IAM_SENSITIVE_BROAD_RESOURCE"]),
          ruleId: "IAM_SENSITIVE_BROAD_RESOURCE",
          severity: "high",
          confidence: "medium",
          title: `Sensitive AWS action on broad resources without conditions`,
          impact: `${label} allows data-plane actions without Resource scoping or restrictive Condition keys.`,
          recommendation: "Scope resources to named ARNs and add condition keys appropriate to the service (e.g. s3:prefix, dynamodb:LeadingKeys).",
          filePath,
          startLine: 1,
          endLine: 1,
          redactedEvidence: evidence,
          assumptions: "Cannot confirm which identities inherit this policy without deployment context.",
          verification: "static",
        }),
      );
    }

    for (const action of statement.action) {
      const normalised = action.toLowerCase();
      if (SENSITIVE_IAM_MUTATIONS.some((m) => normalised === m.toLowerCase() || normalised === "*")) {
        findings.push(
          iamFinding({
            id: stableFindingId([baseId, "IAM_PRIVILEGED_MUTATION", action]),
            ruleId: "IAM_PRIVILEGED_MUTATION",
            severity: "high",
            confidence: "high",
            title: `IAM policy allows privileged mutation action ${action}`,
            impact: `${label} includes ${action}, which can create or attach broad access if combined with permissive resources.`,
            recommendation: "Restrict mutation actions to break-glass roles with MFA and tight resource ARNs.",
            filePath,
            startLine: 1,
            endLine: 1,
            redactedEvidence: `Action includes ${action}`,
            assumptions: "Effective privilege depends on which principal receives this policy; not verified here.",
            verification: "static",
          }),
        );
        break;
      }
    }
  }

  const allActions = new Set(
    statements.flatMap((s) => s.action.map((a) => a.toLowerCase())),
  );
  for (const pair of PRIV_ESCALATION_PAIRS) {
    if (allActions.has(pair.pass.toLowerCase()) && allActions.has(pair.attach.toLowerCase())) {
      findings.push(
        iamFinding({
          id: stableFindingId([filePath, "IAM_PASSROLE_ATTACH_COMBO"]),
          ruleId: "IAM_PASSROLE_ATTACH_COMBO",
          severity: "high",
          confidence: "medium",
          title: `IAM document combines PassRole with policy attachment actions`,
          impact: `The same policy document allows both ${pair.pass} and ${pair.attach}, a common privilege-escalation pattern when resources are broad.`,
          recommendation: "Separate role-passing from policy mutation, and scope PassRole to specific role ARNs.",
          filePath,
          startLine: 1,
          endLine: 1,
          redactedEvidence: `${pair.pass} + ${pair.attach} present in document`,
          assumptions: "Assumes statements apply to the same principal; identity attachment not verified.",
          verification: "static",
        }),
      );
      break;
    }
  }

  return findings;
}

export function runIamChecks(files: ScannedFile[]): UnifiedFinding[] {
  const jsonFiles = files.filter((f) => f.path.toLowerCase().endsWith(".json"));
  const findings: UnifiedFinding[] = [];

  for (const file of jsonFiles) {
    const parsed = parseIamPolicyFile(file);
    if (!parsed.ok) {
      if (file.content.includes("Statement") || file.content.includes("Effect")) {
        findings.push(
          iamFinding({
            id: stableFindingId(["iam", file.path, "IAM_MALFORMED"]),
            ruleId: "IAM_MALFORMED_DOCUMENT",
            severity: "review",
            confidence: "low",
            title: `IAM-looking JSON could not be parsed safely`,
            impact: parsed.message,
            recommendation: "Validate the IAM JSON with AWS policy linter tools and fix syntax or schema issues.",
            filePath: file.path,
            startLine: 1,
            endLine: 1,
            redactedEvidence: "Malformed IAM JSON (content not shown)",
            assumptions: null,
            verification: "needs_review",
          }),
        );
      }
      continue;
    }

    findings.push(...runRulesOnDocument(parsed));
  }

  return findings;
}
